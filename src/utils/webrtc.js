import { athena as Athena } from '../api';
import { asyncSleep } from '.';
import { getTurnCredentials } from './turn';

const VIDEO_STREAM_NAME = 'camera';
const wallMs = () => performance.timeOrigin + performance.now();

const CLOCK_WINDOW_SIZE = 16;
const CLOCK_PING_MS = 500;

const CONNECTION_DEADLINE_MS = 15000;
const ICE_GATHER_DEADLINE_MS = 8000;

// Avoid raising quiet speaker leakage during pauses in near-end speech.
const MICROPHONE_CONSTRAINTS = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1,
};

// Drop mDNS (.local) host candidates from an SDP — the device can't resolve them.
function stripMdnsCandidates(sdp) {
  return sdp
    .split(/\r\n|\n/)
    .filter((line) => {
      if (!line.startsWith('a=candidate:')) return true;
      return !line.split(' ')[4]?.endsWith('.local'); // connection-address is field 5
    })
    .map((line) => line.replace(/[\w-]+\.local\b/g, '0.0.0.0'))
    .join('\r\n');
}

export class WebRTCConnection extends EventTarget {
  constructor(callbacks) {
    super();
    this.streamTimings = null;
    this.pc = null;
    this.dc = null;
    this.joystickInterval = null;
    this.clockSyncInterval = null;
    this.connectionTimeout = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.callbacks = callbacks;
    this.clockSyncSamples = [];
    this.clockOffsetMs = null;
    this.clockSynced = false;
    this.connectStartedAt = null;
    this.transformWorkers = [];
    this.videoEnabled = false;
    this.connectionState = 'new';
    this.failReason = null;
    this.audioTransceiver = null;
    this.remoteAudioStream = null;
    this.microphoneStream = null;
    this.microphoneRequest = null;
    this.microphoneGeneration = 0;
    this.speaking = false;
    this.listeningEnabled = true;
  }

  _log(message, candidate) {
    const elapsedMs = this.connectStartedAt != null ? performance.now() - this.connectStartedAt : null;
    this.dispatchEvent(new CustomEvent('log', { detail: { message, candidate, elapsedMs } }));
  }

  _setState(state, reason) {
    this.connectionState = state;
    this.failReason = reason ?? null;
    this.callbacks.onConnectionState(state, reason);
  }

  async connect(dongleId, videoEnabled = false, withAudio = true) {
    this.cleanup();
    this._setState('connecting');
    this.connectStartedAt = performance.now();
    this.streamTimings = null;
    this.videoEnabled = videoEnabled;
    
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const turnCreds = await getTurnCredentials();
      if (turnCreds?.iceServers) {
        iceServers = turnCreds.iceServers;
      }
    } catch (err) {
      this._log(`TURN credentials fetch failed, falling back to STUN: ${err.message}`);
    }

    try {
      this.pc = new RTCPeerConnection({
        iceServers,
        bundlePolicy: 'max-bundle',
      });
      this._log('RTCPeerConnection created');
      const pc = this.pc;
      
      this.connectionTimeout = setTimeout(() => {
        this.fail('No direct peer-to-peer routes were found to device. Check network and retry.');
      }, CONNECTION_DEADLINE_MS);

      this.pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'audio') {
          this.remoteAudioStream = new MediaStream([evt.track]);
          this.dispatchEvent(new Event('audiochange'));
        }
        if (evt.track.kind === 'video') {
          if (evt.receiver) {
            // hints: minimize receiver-side buffering on Chrome
            if ('playoutDelayHint' in evt.receiver) evt.receiver.playoutDelayHint = 0;
            if ('jitterBufferTarget' in evt.receiver) evt.receiver.jitterBufferTarget = 0;

            // Set up Transform to extract frame-level timing SEI in frames
            if (typeof window.RTCRtpScriptTransform !== 'undefined') {
              // Standard API (Firefox 117+, future Chrome)
              try {
                const worker = new Worker(
                  new URL('./latency-transform-worker.js', import.meta.url),
                  { type: 'module' },
                );
                this.transformWorkers.push(worker);
                worker.onmessage = (e) => {
                  if (e.data.type === 'timing') {
                    this._processTimingData(e.data.timing);
                  }
                };
                evt.receiver.transform = new window.RTCRtpScriptTransform(worker);
              } catch (e) {
                this._log(e);
              }
            }
          }
          const stream = new MediaStream([evt.track]);
          this.callbacks.onVideoTrack(VIDEO_STREAM_NAME, stream);
        }
      });

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        this._log(`Connection state: ${state}`);
        if (state === 'connected') {
          this._clearConnectionTimeout();
          this._setState('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          this.fail('Connection lost');
        }
      });

      // set up video channel
      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (h264Codecs.length > 0) transceiver.setCodecPreferences(h264Codecs);

      // Negotiate audio without requesting microphone permission during prewarm.
      if (withAudio) this.audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });

      // set up data channel
      this.dc = this.pc.createDataChannel('data', { ordered: true });
      this.dc.onopen = () => {
        this._log('Data channel open');
        this._sendAudioState();
        if (this.videoEnabled) {
          this._sendDc('livestreamVideoEnable', { enabled: true });
          this.enableJoystick(true);
        }
      };
      this.dc.onclose = () => {
        this.enableJoystick(false);
        this._stopClockSync();
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel({ level: Math.round(msg.data.fuelGauge * 100), charging: !!msg.data.charging });
          if (msg.type === 'deviceState') this.callbacks.onIgnition?.(!!msg.data?.started);
          if (msg.type === 'disconnect') this.disconnect(msg.data || 'Connection replaced by another device.');
          if (msg.type === 'audioError') this.dispatchEvent(new CustomEvent('audioerror', { detail: msg.data }));
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch (e) {
          console.warn('webrtc: ignoring malformed data-channel message', e);
        }
      };

      const offer = await this.pc.createOffer();
      if (this.pc !== pc) return;
      await this.pc.setLocalDescription(offer);
      if (this.pc !== pc) return;
      this._log('create offer and setLocalDescription done');

      const candidateReady = new Promise((resolve) => {
        pc.addEventListener('icecandidate', (evt) => {
          if (!evt.candidate) {
            this._log('ICE gathering complete');
            resolve();
          } else if (['relay'].includes(evt.candidate.type)) {
            // short cut when at least the relay candidate is added
            this._log(`Using ${evt.candidate.type} candidate`, evt.candidate);
            resolve();
          }
        });
      });
      await Promise.race([candidateReady, asyncSleep(ICE_GATHER_DEADLINE_MS)]);
      if (this.pc !== pc) throw new Error('Connection torn down during candidate gathering');

      this._log('Sending startStream offer to device');
      const tStep = performance.now();
      const resp = await Athena.postJsonRpcPayload(dongleId, {
        method: 'startStream',
        params: { sdp: stripMdnsCandidates(pc.localDescription.sdp), enabled: this.videoEnabled },
        jsonrpc: '2.0',
        id: 0,
      });
      const rttMs = performance.now() - tStep;
      if (resp == null) {
        this._log(`device error: ${JSON.stringify(resp)}`);
        throw new Error('Device could not be reached. Is it online and connected to the internet?');
      }
      if (resp?.error) {
        this._log(`device error: ${JSON.stringify(resp.error)}`);
        console.log(`device error: ${JSON.stringify(resp.error)}`);
        throw new Error(resp.error.data?.message || resp.error.message || resp.error || 'Device could not be reached. Check console for more details');
      }
      // device reports how long it spent handling startStream; the rest of the RTT is the link
      const deviceProcessMs = typeof resp.result.time === 'number' ? resp.result.time : null;
      const linkMs = deviceProcessMs != null ? Math.max(0, rttMs - deviceProcessMs) : null;
      this.streamTimings = { startStreamRttMs: rttMs, deviceProcessMs, linkMs };
      this._log(
        `Received startStream answer. RTT ${rttMs.toFixed(0)}ms`
          + (deviceProcessMs != null ? `, link ${linkMs.toFixed(0)}ms, device processing ${deviceProcessMs.toFixed(0)}ms` : ''),
      );
      
      // device refuses the stream when another client already holds it; fail this connection
      if (resp.result?.error === 'busy') {
        this.fail(resp.result.message || 'Device is busy with another session.');
        return;
      }

      if (this.pc !== pc) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: resp.result.sdp });
      if (this.pc !== pc) return;
      // Older libdatachannel answers sendrecv even without an audio producer.
      const hasAudioSource = resp.result.sdp.split(/(?=^m=)/m).some((media) => media.startsWith('m=audio ') && /^a=ssrc:/m.test(media));
      if (withAudio && (!hasAudioSource || this.audioTransceiver?.currentDirection !== 'sendrecv')) {
        this._log('Device did not negotiate two-way audio; retrying video-only.');
        return this.connect(dongleId, this.videoEnabled, false);
      }
      this._log('Remote description (answer) set');
    } catch (err) {
      this.fail(err.message);
      throw err;
    }
  }

  _sendDc(type, data) {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify({ type, data }));
      return true;
    }
    return false;
  }

  enableVideo(enabled) {
    this.videoEnabled = enabled;
    this._sendDc('livestreamVideoEnable', { enabled });
    this._sendAudioState();
  }

  _sendAudioState() {
    this._sendDc('livestreamAudioEnable', { enabled: this.videoEnabled && this.listeningEnabled });
  }

  setListening(enabled) {
    this.listeningEnabled = enabled;
    this._sendAudioState();
  }

  setSpeaking(enabled) {
    this.speaking = enabled;
    this.microphoneStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async prepareMicrophone() {
    const sender = this.audioTransceiver?.sender;
    if (!sender || this.audioTransceiver.currentDirection !== 'sendrecv') {
      throw new Error('Two-way audio is unavailable on this device.');
    }
    if (this.microphoneStream) {
      const track = this.microphoneStream.getAudioTracks().find((candidate) => candidate.readyState === 'live');
      if (track) {
        // A live capture track does not imply it is still attached to this sender.
        // Rebind after reconnects or replacement tracks instead of silently sending nothing.
        const generation = this.microphoneGeneration;
        await sender.replaceTrack(track);
        if (generation !== this.microphoneGeneration || sender !== this.audioTransceiver?.sender) {
          throw new Error('Audio connection changed. Release and hold to speak again.');
        }
        return;
      }
      this.releaseMicrophone();
    }
    if (this.microphoneRequest) return this.microphoneRequest;
    const generation = this.microphoneGeneration;
    const request = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MICROPHONE_CONSTRAINTS,
      });
      const track = stream.getAudioTracks()[0];
      track.enabled = false;
      if (generation !== this.microphoneGeneration) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        // Newer browsers can cancel all local playback. Keep ordinary AEC on
        // older browsers, or when the advertised mode cannot be applied.
        if (track.getCapabilities?.().echoCancellation?.includes('all') && track.applyConstraints) {
          try {
            await track.applyConstraints({ ...MICROPHONE_CONSTRAINTS, echoCancellation: { exact: 'all' } });
          } catch {
            this._log('All-playback echo cancellation unavailable; using browser default cancellation.');
          }
        }
        if (generation !== this.microphoneGeneration || sender !== this.audioTransceiver?.sender) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const settings = track.getSettings?.() || {};
        this._log(`Microphone processing: echoCancellation=${settings.echoCancellation ?? 'unknown'}, noiseSuppression=${settings.noiseSuppression ?? 'unknown'}, autoGainControl=${settings.autoGainControl ?? 'unknown'}`);
        await sender.replaceTrack(track);
        if (generation !== this.microphoneGeneration) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.microphoneStream = stream;
        track.addEventListener('ended', () => {
          if (this.microphoneStream !== stream) return;
          this.releaseMicrophone();
          this.dispatchEvent(new CustomEvent('audioerror', { detail: 'Microphone disconnected. Hold to speak to retry.' }));
        });
        track.enabled = this.speaking;
      } catch (error) {
        stream.getTracks().forEach((t) => t.stop());
        throw error;
      }
    })();
    this.microphoneRequest = request;
    try { await request; } finally {
      if (this.microphoneRequest === request) this.microphoneRequest = null;
    }
  }

  releaseMicrophone() {
    this.microphoneGeneration += 1;
    this.setSpeaking(false);
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream = null;
    this.microphoneRequest = null;
  }

  switchCamera(cameraName) {
    this._sendDc('livestreamCameraSwitch', { camera: cameraName });
  }

  setQuality(quality) {
    this._sendDc('livestreamSettings', { quality: quality });
  }
  
  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    this._sendDc('testJoystick', { axes: [this.joystickX, this.joystickY], buttons: [false] });
  }
  
  enableJoystick(enabled) {
    if (enabled) {
      if (this.joystickInterval) return;
      this.joystickInterval = setInterval(() => this.sendJoystick(), 50);
      this.sendJoystick();
    } else {
      if (this.joystickInterval) {
        clearInterval(this.joystickInterval);
        this.joystickInterval = null;
      }
    }
  }

  _clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  _stopClockSync() {
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
      this.clockSyncInterval = null;
    }
    this.clockSyncSamples = [];
    this.clockOffsetMs = null;
    this.clockSynced = false;
  }

  setTimingSei(enabled) {
    this._sendDc('enableTimingSei', { enabled });
    if (enabled) {
      if (!this.clockSyncInterval) {
        this._sendClockPing();
        this.clockSyncInterval = setInterval(() => this._sendClockPing(), CLOCK_PING_MS);
      }
    } else {
      this._stopClockSync();
    }
  }

  _processTimingData(timing) {
    const browserReceiveMs = wallMs();
    const latency = {
      captureMs: timing.captureMs,
      encodeMs: timing.encodeMs,
      captureEncodeMs: timing.captureMs + timing.encodeMs + timing.sendDelayMs,
      networkMs: null,
      totalMs: null,
    };

    if (this.clockSynced) {
      const raw = browserReceiveMs - (timing.deviceSendWallMs - this.clockOffsetMs);
      latency.networkMs = Math.max(0, raw);
      latency.totalMs = latency.captureEncodeMs + latency.networkMs;
    }

    this.callbacks.onLatencyUpdate?.(latency);
  }

  _sendClockPing() {
    this._sendDc('clockSync', { action: 'ping', browserSendTime: wallMs() });
  }

  _handleClockPong(data) {
    const now = wallMs();
    const rttMs = now - data.browserSendTime;
    const offsetMs = data.deviceTime - (data.browserSendTime + now) / 2;

    this.clockSyncSamples.push({ offsetMs, rttMs });
    if (this.clockSyncSamples.length > CLOCK_WINDOW_SIZE) this.clockSyncSamples.shift();

    // pick the smallest-RTT sample: congestion can only inflate RTT, never deflate it,
    // so min-RTT is the least biased estimate of one-way offset
    let best = this.clockSyncSamples[0];
    for (const s of this.clockSyncSamples) if (s.rttMs < best.rttMs) best = s;
    this.clockOffsetMs = best.offsetMs;
    this.clockSynced = true;
  }

  disconnect(reason) {
    this.cleanup();
    this._setState('disconnected', reason);
  }

  fail(reason) {
    this.cleanup();
    this._setState('failed', reason);
  }

  cleanup() {
    this.releaseMicrophone();
    this.remoteAudioStream = null;
    this.audioTransceiver = null;
    this._clearConnectionTimeout();
    this.enableJoystick(false);
    this._stopClockSync();
    for (const worker of this.transformWorkers.splice(0)) {
      worker.terminate();
    }
    if (this.dc) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onmessage = null;
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      if (this.pc.getReceivers) {
        this.pc.getReceivers().forEach((receiver) => {
          if (receiver.track?.stop) receiver.track.stop();
        });
      }
      if (this.pc.getTransceivers) {
        this.pc.getTransceivers().forEach((t) => {
          if (t.stop) t.stop();
        });
      }
      this.pc.close();
      this.pc = null;
    }
  }
}

// Holds a single pre-warmed WebRTCConnection
export class WebRTCConnectionManager {
  constructor() {
    this.connection = null;
    this.dongleId = null;
    this.subscriber = null;
    this.videoWanted = false;
    this.battery = null;
    this.stream = null;
    this.streamName = null;
    this.awayTimer = null;
    this.prewarm_enabled = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.disconnect());
      document.addEventListener('visibilitychange', () => this._armAwayTimer());
      window.addEventListener('blur', () => this._armAwayTimer());
      window.addEventListener('focus', () => this._armAwayTimer());
    }
  }
  
  _armAwayTimer() {
    clearTimeout(this.awayTimer);
    const away = document.hidden || !document.hasFocus();
    if (!away) {
      if (!this.dongleId || this.connection) return;
      if (this.subscriber) this.reconnect(this.dongleId);
      else if (this.prewarm_enabled) this.prewarm(this.dongleId);
      return;
    }
    if (this.connectionState !== 'connecting' && this.connectionState !== 'connected') return;
    const delay = document.hidden ? 30000 : 60000;
    this.awayTimer = setTimeout(() => {
      if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
        // keep `dongleId` so focus can re-warm the same device
        this._teardown('Session timed out');
      }
    }, delay);
  }

  get connectionState() { return this.connection?.connectionState ?? 'none'; }
  get failReason() { return this.connection?.failReason ?? null; }

  _healthy(dongleId) {
    return Boolean(this.connection
      && (this.connectionState === 'connecting' || this.connectionState === 'connected')
      && (!dongleId || this.dongleId === dongleId));
  }

  prewarm(dongleId) {
    if (!dongleId) return;
    if (this._healthy(dongleId)) return;
    this.prewarm_enabled = true;
    this._open(dongleId);
  }

  _open(dongleId, videoEnabled = false) {
    this.disconnect();
    this.dongleId = dongleId;
    // ignore callbacks from a connection we've already torn down or replaced
    let conn;
    const guard = (handler) => (...args) => {
      if (this.connection === conn) handler(...args);
    };
    conn = new WebRTCConnection({
      onConnectionState: guard((state, reason) => {
        if (state === 'connected' && this.videoWanted) this.connection?.enableVideo(true);
        this.subscriber?.onConnectionState?.(state, reason);
      }),
      onBatteryLevel: guard((battery) => {
        this.battery = battery;
        this.subscriber?.onBatteryLevel?.(battery);
      }),
      onVideoTrack: guard((name, stream) => {
        this.streamName = name;
        this.stream = stream;
        this.subscriber?.onVideoTrack?.(name, stream);
      }),
      onLatencyUpdate: guard((latency) => {
        this.subscriber?.onLatencyUpdate?.(latency);
      }),
      onIgnition: guard((ignition) => {
        this.subscriber?.onIgnition?.(ignition);
      }),
    });
    this.connection = conn;
    conn.connect(dongleId, videoEnabled).catch(() => {});
  }

  acquire(dongleId, callbacks) {
    if (!this._healthy(dongleId)) {
      this._open(dongleId, true);
    }
    this.setVideoEnabled(true);
    this.setJoystickEnabled(true);
    this.subscriber = callbacks;
    callbacks?.onConnectionState?.(this.connectionState, this.failReason);
    if (this.battery != null) callbacks?.onBatteryLevel?.(this.battery);
    if (this.stream) callbacks?.onVideoTrack?.(this.streamName, this.stream);
    return this.connection;
  }

  release(callbacks) {
    if (callbacks && this.subscriber !== callbacks) return;
    this.subscriber = null;
    this.connection?.releaseMicrophone();
    this.connection?.setListening(false);
    this.setVideoEnabled(false);
    this.setJoystickEnabled(false);
  }

  reconnect(dongleId) {
    this._open(dongleId ?? this.dongleId, true);
    this.setVideoEnabled(true);
    this.setJoystickEnabled(true);
    return this.connection;
  }

  // tear down the live connection but remember `dongleId` so can rewarm
  _teardown(reason) {
    clearTimeout(this.awayTimer);
    this.videoWanted = false;
    if (this.connection) {
      this.connection.disconnect(reason);
      this.connection = null;
    }
    this.battery = null;
    this.stream = null;
    this.streamName = null;
  }

  disconnect(reason) {
    this._teardown(reason);
    this.dongleId = null;
  }
  
  setVideoEnabled(enabled) {
    this.videoWanted = enabled;
    if (this.connection && this.connectionState === 'connected') {
      this.connection.enableVideo(enabled);
    }
  }

  setJoystickEnabled(enabled) {
    if (this.connection && this.connectionState === 'connected') {
      this.connection.enableJoystick(enabled);
    }
  }
}

export const webrtcConnectionManager = new WebRTCConnectionManager();
