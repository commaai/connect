import { athena as Athena } from '@commaai/api';

const VIDEO_STREAM_NAME = 'camera';
const wallMs = () => performance.timeOrigin + performance.now();

const CLOCK_WINDOW_SIZE = 16;
const CLOCK_PING_MS = 500;

const CONNECTION_DEADLINE_MS = 8000;

export const ConnectStep = {
  GATHERING_CANDIDATES: 1,
  PROCESSING_CANDIDATES: 2,
  ESTABLISHING: 3,
};

export class WebRTCConnection extends EventTarget {
  constructor(callbacks) {
    super();
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
  }

  // emit a 'log' event for consumers (e.g. the latency test) to display;
  // candidate is passed raw so the consumer owns ICE candidate formatting
  _log(message, candidate) {
    const elapsed = this.connectStartedAt != null ? ` +${(performance.now() - this.connectStartedAt).toFixed(0)}ms` : '';
    console.log(`[webrtc${elapsed}] ${message}`);
    this.dispatchEvent(new CustomEvent('log', { detail: { message, candidate } }));
  }

  async connect(dongleId) {
    this.cleanup();
    this.callbacks.onConnectionState('connecting');
    this.connectStartedAt = performance.now();

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
        encodedInsertableStreams: true,
      });

      this.pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
          if (evt.receiver) {
            // Minimize receiver-side buffering for low-latency playback
            if ('playoutDelayHint' in evt.receiver) {
              evt.receiver.playoutDelayHint = 0;
            }
            if ('jitterBufferTarget' in evt.receiver) {
              evt.receiver.jitterBufferTarget = 0;
            }

            // Set up Transform to extract frame-level timing SEI in frames
            if (typeof window.RTCRtpScriptTransform !== 'undefined') {
              // Standard API (Firefox 117+, future Chrome)
              try {
                const worker = new Worker(
                  new URL('./latency-transform-worker.js', import.meta.url),
                  { type: 'module' },
                );
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

      this.connectionTimeout = setTimeout(() => {
        this.fail('No valid webrtc candidate routes were found to device. Check network and retry.');
      }, CONNECTION_DEADLINE_MS);

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        if (state === 'connected') {
          this._clearConnectionTimeout();
          this.callbacks.onConnectionState('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          this.fail('Connection lost');
        }
      });

      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (h264Codecs.length > 0) {
        transceiver.setCodecPreferences(h264Codecs);
      }
      this.dc = this.pc.createDataChannel('data', { ordered: true });
      this.dc.onopen = () => {
        this.joystickInterval = setInterval(() => this.sendJoystick(), 50);
        this.sendJoystick();
      };
      this.dc.onclose = () => {
        this._clearJoystickInterval();
        this._stopClockSync();
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel({ level: Math.round(msg.data.fuelGauge * 100), charging: !!msg.data.charging });
          if (msg.type === 'connectionReplaced') this.fail(msg.data || 'Connection replaced by another device.');
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch (e) {
          console.warn('webrtc: ignoring malformed data-channel message', e);
        }
      };

      let sessionId = null;
      const pendingCandidates = [];
      const sendCandidate = (candidate) => {
        this._log('Sending addIceCandidate to device', candidate);
        return Athena.postJsonRpcPayload(dongleId, {
          method: 'addIceCandidate',
          params: { session_id: sessionId, candidate },
          jsonrpc: '2.0',
          id: 0,
        });
      };
      this.pc.addEventListener('icecandidate', (evt) => {
        // skip mDNS candidates, aiortc can't resolve them
        // https://github.com/commaai/connect/issues/609
        if (evt.candidate?.address?.endsWith('.local')) return;
        if (sessionId === null) {
          pendingCandidates.push(evt.candidate);
        } else {
          sendCandidate(evt.candidate);
        }
      });

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.callbacks.onConnectProgress?.(ConnectStep.GATHERING_CANDIDATES);

      // bake initial candidates
      const sections = offer.sdp.split(/^(?=m=)/m);
      let bakedCandidates = 0;
      for (const candidate of pendingCandidates.splice(0)) {
        if (!candidate?.candidate) continue; // skip end-of-candidates marker
        const idx = (candidate.sdpMLineIndex ?? 0) + 1;
        if (sections[idx]) {
          sections[idx] += `a=${candidate.candidate}\r\n`;
          bakedCandidates += 1;
        }
      }
      this._log(`Baked ${bakedCandidates} initial ICE candidate(s) into offer`);

      this._log('Sending startStream offer to device');
      const resp = await Athena.postJsonRpcPayload(dongleId, {
        method: 'startStream',
        params: { sdp: sections.join('') },
        jsonrpc: '2.0',
        id: 0,
      });
      if (resp?.error) {
        this._log(`device error: ${JSON.stringify(resp.error)}`);
        throw new Error(resp.error.data?.message || 'Could not reach device. Is the ignition on?');
      }
      if (!resp?.result) {
        throw new Error('Could not reach device. Is the ignition on?');
      }

      this._log(`Received startStream answer from device (session ${resp.result.session_id})`);
      await this.pc.setRemoteDescription({ type: 'answer', sdp: resp.result.sdp });
      this._log('Remote description (answer) set');

      sessionId = resp.result.session_id;
      const trickleCandidates = pendingCandidates.splice(0);
      this._log(`Flushing ${trickleCandidates.length} queued ICE candidate(s)`);
      trickleCandidates.forEach(sendCandidate);
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

  switchCamera(cameraName) {
    this._sendDc('livestreamCameraSwitch', { camera: cameraName });
  }

  setQuality(quality) {
    this._sendDc('livestreamSettings', { quality: quality });
  }

  _clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  _clearJoystickInterval() {
    if (this.joystickInterval) {
      clearInterval(this.joystickInterval);
      this.joystickInterval = null;
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
      captureEncodeMs: timing.captureMs + timing.encodeMs,
      sendDelayMs: timing.sendDelayMs,
      devicePipelineMs: timing.captureMs + timing.encodeMs + timing.sendDelayMs,
      networkMs: null,
      totalMs: null,
    };

    if (this.clockSynced) {
      const raw = browserReceiveMs - (timing.deviceSendWallMs - this.clockOffsetMs);
      latency.networkMs = Math.max(0, raw);
      latency.totalMs = latency.devicePipelineMs + latency.networkMs;
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

  /*** body teleop helpers ***/
  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    this._sendDc('testJoystick', { axes: [this.joystickX, this.joystickY], buttons: [false] });
  }
  /***************************/

  disconnect() {
    this.cleanup();
    this.callbacks.onConnectionState('disconnected');
  }

  fail(reason) {
    this.cleanup();
    this.callbacks.onConnectionState('failed', reason);
  }

  cleanup() {
    this._clearConnectionTimeout();
    this._clearJoystickInterval();
    this._stopClockSync();
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
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
