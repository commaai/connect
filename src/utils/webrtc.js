import { athena as Athena } from '@commaai/api';

const VIDEO_STREAM_NAME = 'camera';
const wallMs = () => performance.timeOrigin + performance.now();

const CLOCK_WINDOW_SIZE = 16;
const CLOCK_PING_MS = 500;

const CONNECTION_DEADLINE_MS = 10000;

export class WebRTCConnection extends EventTarget {
  constructor(callbacks) {
    super();
    this.sessionId = null;
    this.deviceTimings = null;
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
    // desired video-enable state; (re)sent when the data channel opens so an
    // enableVideo() that races the channel open (e.g. the no-prewarm reload path) isn't lost
    this.videoEnabled = false;
  }

  _log(message, candidate, data) {
    this.dispatchEvent(new CustomEvent('log', { detail: { message, candidate, data } }));
  }

  async connect(dongleId) {
    this.cleanup();
    this.callbacks.onConnectionState('connecting');
    this.connectStartedAt = performance.now();
    this.streamTimings = null;

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
        encodedInsertableStreams: true,
      });
      this._log('RTCPeerConnection created');
      // capture the pc we're handshaking on; if cleanup()/a newer connect() swaps or nulls
      // this.pc while we're awaiting below, we must bail instead of operating on a dead pc
      // (which would throw before startStream and silently abort the connection)
      const pc = this.pc;
      this.pc.addEventListener('icegatheringstatechange', () => {
        if (this.pc) this._log(`ICE gathering state: ${this.pc.iceGatheringState}`);
      });
      this.pc.addEventListener('iceconnectionstatechange', () => {
        if (this.pc) this._log(`ICE connection state: ${this.pc.iceConnectionState}`);
      });

      this.pc.addEventListener('track', (evt) => {
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

      this.connectionTimeout = setTimeout(() => {
        this.fail('No valid webrtc candidate routes were found to device. Check network and retry.');
      }, CONNECTION_DEADLINE_MS);

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        this._log(`Connection state: ${state}`);
        if (state === 'connected') {
          this._clearConnectionTimeout();
          this.callbacks.onConnectionState('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          this.fail('Connection lost');
        }
      });

      // set up video channel
      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (h264Codecs.length > 0) transceiver.setCodecPreferences(h264Codecs);

      // set up data channel
      this.dc = this.pc.createDataChannel('data', { ordered: true });
      this.dc.onopen = () => {
        this._log('Data channel open');
        // the channel can open after connectionState flips to 'connected'; flush the
        // desired video state now so an enableVideo() sent before this isn't dropped
        if (this.videoEnabled) this._sendDc('livestreamVideoEnable', { enabled: true });
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

      // session id is generated client-side and sent with startStream, so
      // candidates can trickle to the device while startStream is in flight
      const sessionId = crypto.randomUUID();
      this.sessionId = sessionId;
      const CANDIDATE_RETRY_MS = 250;
      const CANDIDATE_MAX_RETRIES = 8;
      const sendCandidate = (candidate, attempt = 0) => {
        // candidates can outrun startStream; webrtcd 404s until the stream
        // session exists, so resend until it does
        const retry = (reason) => {
          if (attempt >= CANDIDATE_MAX_RETRIES || this.sessionId !== sessionId || !this.pc) {
            this._log(`addIceCandidate failed: ${reason}`, candidate);
            return null;
          }
          this._log(`stream session not available yet, resending candidate (attempt ${attempt + 1})`, candidate);
          return new Promise((resolve) => { setTimeout(resolve, CANDIDATE_RETRY_MS); })
            .then(() => sendCandidate(candidate, attempt + 1));
        };
        // const tSend = performance.now();
        // this._log('Sending addIceCandidate to device', candidate);
        return Athena.postJsonRpcPayload(dongleId, {
          method: 'addIceCandidate',
          params: { session_id: sessionId, candidate },
          jsonrpc: '2.0',
          id: 0,
        }).then((resp) => {
          // this._log(`addIceCandidate RTT ${(performance.now() - tSend).toFixed(0)}ms`, candidate);
          const errMsg = resp?.error?.data?.message || resp?.error?.message;
          if (errMsg && (errMsg.includes('not available yet') || errMsg.includes('404'))) {
            return retry(errMsg);
          }
          return resp;
        }).catch((err) => {
          if (err.resp?.status === 404) return retry(err.message);
          this._log(`addIceCandidate failed: ${err.message}`, candidate);
          return null;
        });
      };
      let tStep = performance.now();
      const offer = await this.pc.createOffer();
      if (this.pc !== pc) return;
      this._log(`createOffer done (${(performance.now() - tStep).toFixed(0)}ms)`);
      tStep = performance.now();
      await this.pc.setLocalDescription(offer);
      if (this.pc !== pc) return;
      this._log(`setLocalDescription done (${(performance.now() - tStep).toFixed(0)}ms)`);

      this._log('Sending startStream offer to device');
      tStep = performance.now();
      const streamPromise = Athena.postJsonRpcPayload(dongleId, {
        method: 'startStream',
        // always negotiate with video off: the device returns the SDP answer without waiting
        // on camera/encoder init, so the handshake stays fast. video is flipped on afterward
        // over the data channel (see WebRTCConnectionManager.acquire / enableVideo)
        params: { sdp: offer.sdp, session_id: sessionId, video_enabled: false },
        jsonrpc: '2.0',
        id: 0,
      });

      this.pc.addEventListener('icecandidate', (evt) => {
        // this._log('Local ICE candidate gathered', evt.candidate);
        if (!evt.candidate) return;
        sendCandidate(evt.candidate);
      });

      let resp;
      try {
        resp = await streamPromise;
      } catch (err) {
        console.error('webrtc: startStream request failed', { dongleId, sessionId }, err);
        throw err;
      }
      if (this.pc !== pc) return;
      const rttMs = performance.now() - tStep;
      if (resp?.error) {
        console.error('webrtc: startStream device error', { dongleId, sessionId }, resp.error);
        this._log(`device error: ${JSON.stringify(resp.error)}`);
        throw new Error(resp.error.data?.message || 'Could not reach device. Is the ignition on?');
      }
      if (!resp?.result) {
        console.error('webrtc: startStream returned no result', { dongleId, sessionId }, resp);
        throw new Error('Could not reach device. Is the ignition on?');
      }
      // device reports how long it spent handling startStream; the rest of the RTT is the link
      const deviceProcessMs = typeof resp.result.time === 'number' ? resp.result.time : null;
      const linkMs = deviceProcessMs != null ? Math.max(0, rttMs - deviceProcessMs) : null;
      this.streamTimings = { startStreamRttMs: rttMs, deviceProcessMs, linkMs };
      this._log(
        `startStream RTT ${rttMs.toFixed(0)}ms`
          + (deviceProcessMs != null ? `, link ${linkMs.toFixed(0)}ms, device processing ${deviceProcessMs.toFixed(0)}ms` : ''),
        undefined,
        this.streamTimings,
      );
      this._log(`Received startStream answer from device (session ${resp.result.session_id})`);

      tStep = performance.now();
      await this.pc.setRemoteDescription({ type: 'answer', sdp: resp.result.sdp });
      this._log(`Remote description (answer) set (${(performance.now() - tStep).toFixed(0)}ms)`);
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

// Holds a single pre-warmed WebRTCConnection so the handshake can start as soon as a
// device is selected (video disabled), and body teleop only has to flip video on when it
// opens. Decoupled from React component lifecycles so the connection survives across
// body-teleop open/close. Use the shared `webrtcConnectionManager` singleton.
export class WebRTCConnectionManager {
  constructor() {
    this.connection = null;
    this.dongleId = null;
    this.subscriber = null;
    this.videoWanted = false;
    // cached so a subscriber that attaches after the connection is already up gets current state
    this.connectionState = 'none';
    this.failReason = null;
    this.battery = null;
    this.stream = null;
    this.streamName = null;
  }

  // Open (or keep) a video-disabled connection to dongleId. No-op if one is already
  // warming/warm for the same device.
  prewarm(dongleId) {
    if (!dongleId) return;
    if (this.connection && this.dongleId === dongleId
        && (this.connectionState === 'connecting' || this.connectionState === 'connected')) {
      return;
    }
    this._open(dongleId);
  }

  _open(dongleId) {
    this.disconnect();
    this.dongleId = dongleId;
    this.connectionState = 'connecting';
    // identity-guard every callback: a superseded connection (one replaced by a newer
    // _open while its async connect() was still in flight) must not write back to the
    // singleton and clobber the live connection's state.
    const conn = new WebRTCConnection({
      onConnectionState: (state, reason) => {
        if (this.connection !== conn) return;
        this.connectionState = state;
        this.failReason = reason ?? null;
        // (re)apply the desired video state once the data channel is up
        if (state === 'connected' && this.videoWanted) this.connection?.enableVideo(true);
        this.subscriber?.onConnectionState?.(state, reason);
      },
      onBatteryLevel: (battery) => {
        if (this.connection !== conn) return;
        this.battery = battery;
        this.subscriber?.onBatteryLevel?.(battery);
      },
      onVideoTrack: (name, stream) => {
        if (this.connection !== conn) return;
        this.streamName = name;
        this.stream = stream;
        this.subscriber?.onVideoTrack?.(name, stream);
      },
      onLatencyUpdate: (latency) => {
        if (this.connection !== conn) return;
        this.subscriber?.onLatencyUpdate?.(latency);
      },
    });
    this.connection = conn;
    conn.connect(dongleId).catch(() => {
      // onConnectionState('failed') has already fired via fail()
    });
  }

  // Attach a subscriber (body teleop) and get a video-streaming WebRTCConnection. Reuses the
  // pre-warmed (video-off) connection when healthy, else opens a fresh one; either way video
  // is flipped on over the data channel once connected. startStream always negotiates with
  // video off so the device doesn't block its SDP answer on camera/encoder init — that keeps
  // the handshake fast on the no-prewarm reload path too. Replays current state so the UI is
  // correct immediately even when the connection was pre-warmed before the subscriber mounted.
  acquire(dongleId, callbacks) {
    // reuse the pre-warmed connection only if it's actually healthy for this device;
    // a failed/closed pre-warm must be re-opened or teleop attaches to a dead connection
    // and never sends a fresh startStream
    const healthy = this.connection
      && (this.connectionState === 'connecting' || this.connectionState === 'connected')
      && (!dongleId || this.dongleId === dongleId);
    if (!healthy) {
      this._open(dongleId);
    }
    this.setVideoEnabled(true);
    this.subscriber = callbacks;
    callbacks?.onConnectionState?.(this.connectionState, this.failReason);
    if (this.battery != null) callbacks?.onBatteryLevel?.(this.battery);
    if (this.stream) callbacks?.onVideoTrack?.(this.streamName, this.stream);
    return this.connection;
  }

  // Detach a subscriber and stop the video stream, but keep the connection warm for re-open.
  release(callbacks) {
    if (callbacks && this.subscriber !== callbacks) return;
    this.subscriber = null;
    this.setVideoEnabled(false);
  }

  setVideoEnabled(enabled) {
    this.videoWanted = enabled;
    if (this.connection && this.connectionState === 'connected') {
      this.connection.enableVideo(enabled);
    }
  }

  reconnect(dongleId) {
    this._open(dongleId ?? this.dongleId);
    this.setVideoEnabled(true);
    return this.connection;
  }

  disconnect() {
    this.videoWanted = false;
    if (this.connection) {
      const conn = this.connection;
      this.connection = null;
      conn.disconnect();
    }
    this.connectionState = 'none';
    this.failReason = null;
    this.battery = null;
    this.stream = null;
    this.streamName = null;
  }
}

export const webrtcConnectionManager = new WebRTCConnectionManager();
