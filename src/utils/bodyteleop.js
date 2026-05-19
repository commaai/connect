import { athena as Athena } from '@commaai/api';
import { asyncSleep } from '.';

const VIDEO_STREAM_NAME = 'camera';
const wallMs = () => performance.timeOrigin + performance.now();

export class BodyTeleopConnection {
  constructor(callbacks) {
    this.pc = null;
    this.dc = null;
    this.joystickInterval = null;
    this.clockSyncInterval = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.artificialLatencyMs = 0;
    this.pendingDataChannelSendTimers = new Set();
    this.videoFrameDelay = null;
    this.videoFrameReleaseAt = 0;
    this.videoReceiver = null;
    this.callbacks = callbacks;
    this.clockOffset = 0;
    this.clockSynced = false;
  }

  async connectDirect(address) {
    this.directAddress = address;
    return this.connect(null);
  }

  async connect(dongleId) {
    this.cleanup();
    this.callbacks.onConnectionState('connecting');
    const t0 = performance.now();
    const log = (msg) => console.log(`[bodyteleop +${(performance.now() - t0).toFixed(0)}ms] ${msg}`);

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        encodedInsertableStreams: true,
      });

      this.pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
          if (evt.receiver) {
            this.videoReceiver = evt.receiver;

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
                log(e)
              }
              
              
            }
          }
          const stream = this._createVideoStream(evt.track);
          this._applyVideoDelay();
          this.callbacks.onVideoTrack(VIDEO_STREAM_NAME, stream);
        }
      });

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        if (state === 'connected') {
          this.callbacks.onStatusMessage?.('Receiving video...');
          this.callbacks.onConnectionState('connected');
        }
        else if (state === 'failed' || state === 'closed') this.callbacks.onConnectionState('failed');
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
        this._clearPendingDataChannelSends();
        this._stopClockSync();
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel({ level: Math.round(msg.data.fuelGauge * 100), charging: !!msg.data.charging });
          if (msg.type === 'connectionReplaced') this.callbacks.onConnectionReplaced?.(msg.data);
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch (e) {
          console.warn('bodyteleop: ignoring malformed data-channel message', e);
        }
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.callbacks.onStatusMessage?.('Preparing connection...');

      // Trickle ICE: resolve as soon as we get the first candidate rather than
      // waiting for all candidates to be gathered
      await Promise.race([
        new Promise((resolve) => {
          if (this.pc.iceGatheringState === 'complete') return resolve();
          let onCandidate, onComplete;
          onCandidate = (evt) => {
            if (evt.candidate) {
              this.callbacks.onStatusMessage?.('Finding network path...');
              this.pc.removeEventListener('icecandidate', onCandidate);
              this.pc.removeEventListener('icegatheringstatechange', onComplete);
              resolve();
            }
          };
          onComplete = () => {
            if (this.pc.iceGatheringState === 'complete') {
              this.pc.removeEventListener('icecandidate', onCandidate);
              this.pc.removeEventListener('icegatheringstatechange', onComplete);
              resolve();
            }
          };
          this.pc.addEventListener('icecandidate', onCandidate);
          this.pc.addEventListener('icegatheringstatechange', onComplete);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timed out')), 5000)),
      ]);

      // avoid rtcp-mux error on firefox
      // needed until teleoprtc is resolved
      await asyncSleep(250);
      const sdp = this.pc.localDescription.sdp.replace(
        /(m=(audio|video) .*\r?\n)([\s\S]*?)(?=m=|$)/g,
        (block) => block.includes('a=rtcp-mux') ? block : block.replace(/(m=(?:audio|video) [^\n]*\n)/, '$1a=rtcp-mux\r\n'),
      );
      this.callbacks.onStatusMessage?.('Reaching device...');
      
      let answerSdp;
      if (dongleId) {
        const payload = {
          method: 'startJoystickStream',
          params: { sdp },
          jsonrpc: '2.0',
          id: 0,
        };
        const resp = await Athena.postJsonRpcPayload(dongleId, payload);
        if (!resp?.result || resp.error) {
          throw new Error('Could not reach device. Is the ignition on?');
        }
        this.callbacks.onStatusMessage?.('Device responded');
        answerSdp = resp.result.sdp;
      } else if (this.directAddress) {
        let resp;
        try {
          resp = await fetch(`http://${this.directAddress}:5001/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp, initCamera: "driver", bridge_services_in: ["testJoystick", "soundRequest", "livestreamCameraSwitch"], bridge_services_out: ['carState'] }),
          });
        } catch (_) {
          throw new Error('Could not reach device. Is the ignition on?');
        }
        if (!resp.ok) {
          throw new Error(`Device experienced an error (${resp.status})`);
        }
        this.callbacks.onStatusMessage?.('Device responded');
        const result = await resp.json();
        answerSdp = result.sdp;
      }

      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      this.callbacks.onStatusMessage?.('Establishing connection...');
    } catch (err) {
      this.cleanup();
      this.callbacks.onConnectionState('failed');
      throw err;
    }
  }

  _sendDc(type, data, { delayMs = 0 } = {}) {
    if (this.dc?.readyState !== 'open') return false;

    const payload = JSON.stringify({ type, data });
    if (delayMs <= 0) {
      this.dc.send(payload);
      return true;
    }

    const dc = this.dc;
    let timer = null;
    timer = setTimeout(() => {
      this.pendingDataChannelSendTimers.delete(timer);
      if (this.dc === dc && dc.readyState === 'open') {
        dc.send(payload);
      }
    }, delayMs);
    this.pendingDataChannelSendTimers.add(timer);
    return true;
  }

  async playSound(sound) {
    if (!this._sendDc('soundRequest', { sound })) {
      throw new Error('Body sound buttons require an active teleop connection.');
    }
  }

  switchCamera(cameraName) {
    this._sendDc('livestreamCameraSwitch', { camera: cameraName });
  }

  setArtificialLatency(ms) {
    const nextLatency = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
    this.artificialLatencyMs = nextLatency;
    this._applyVideoDelay();
  }

  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    this._sendDc(
      'testJoystick',
      { axes: [this.joystickX, this.joystickY], buttons: [false] },
      { delayMs: this.artificialLatencyMs },
    );
  }

  _clearJoystickInterval() {
    if (this.joystickInterval) {
      clearInterval(this.joystickInterval);
      this.joystickInterval = null;
    }
  }

  _clearPendingDataChannelSends() {
    this.pendingDataChannelSendTimers.forEach((timer) => clearTimeout(timer));
    this.pendingDataChannelSendTimers.clear();
  }

  _createVideoStream(track) {
    this._stopVideoFrameDelay();
    const delayedTrack = this._createDelayedVideoTrack(track);
    return new MediaStream([delayedTrack || track]);
  }

  _createDelayedVideoTrack(track) {
    if (typeof window === 'undefined') return null;
    const Processor = window.MediaStreamTrackProcessor;
    const Generator = window.MediaStreamTrackGenerator;
    if (typeof Processor !== 'function' || typeof Generator !== 'function') return null;

    try {
      const processor = new Processor({ track });
      const generator = new Generator({ kind: 'video' });
      const state = {
        reader: processor.readable.getReader(),
        writer: generator.writable.getWriter(),
        track: generator,
        timers: new Map(),
        stopped: false,
        writeChain: Promise.resolve(),
      };
      this.videoFrameDelay = state;
      this.videoFrameReleaseAt = performance.now();
      this._pumpDelayedVideoFrames(state);
      return generator;
    } catch (err) {
      console.warn('bodyteleop: unable to create decoded video frame delay', err);
      this.videoFrameDelay = null;
      return null;
    }
  }

  async _pumpDelayedVideoFrames(state) {
    const writeFrame = (frame) => {
      state.writeChain = state.writeChain.then(async () => {
        if (state.stopped) {
          this._closeVideoFrame(frame);
          return;
        }
        await state.writer.write(frame);
      }).catch((err) => {
        this._closeVideoFrame(frame);
        if (!state.stopped) {
          console.warn('bodyteleop: delayed video frame write failed', err);
        }
      });
    };

    try {
      while (!state.stopped) {
        // eslint-disable-next-line no-await-in-loop
        const { value: frame, done } = await state.reader.read();
        if (done) break;

        const now = performance.now();
        const releaseAt = Math.max(now + this.artificialLatencyMs, this.videoFrameReleaseAt);
        this.videoFrameReleaseAt = releaseAt;
        const waitMs = releaseAt - now;

        if (waitMs <= 0) {
          writeFrame(frame);
          continue;
        }

        let timer = null;
        timer = setTimeout(() => {
          state.timers.delete(timer);
          if (state.stopped) {
            this._closeVideoFrame(frame);
            return;
          }
          writeFrame(frame);
        }, waitMs);
        state.timers.set(timer, frame);
      }
    } catch (err) {
      if (!state.stopped) {
        console.warn('bodyteleop: decoded video frame delay failed', err);
      }
    }
  }

  _stopVideoFrameDelay() {
    const state = this.videoFrameDelay;
    if (!state) return;

    state.stopped = true;
    state.timers.forEach((frame, timer) => {
      clearTimeout(timer);
      this._closeVideoFrame(frame);
    });
    state.timers.clear();
    state.reader.cancel().catch(() => {});
    state.writer.abort().catch(() => {});
    if (state.track.stop) state.track.stop();
    this.videoFrameDelay = null;
  }

  _closeVideoFrame(frame) {
    if (frame?.close) frame.close();
  }

  _stopClockSync() {
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
      this.clockSyncInterval = null;
    }
    this.clockSynced = false;
  }

  _applyVideoDelay(receiver = this.videoReceiver) {
    if (!receiver) return;
    const ms = this.videoFrameDelay ? 0 : this.artificialLatencyMs;
    const seconds = ms / 1000;
    try {
      if ('playoutDelayHint' in receiver) {
        receiver.playoutDelayHint = seconds;
      }
      if ('jitterBufferTarget' in receiver) {
        receiver.jitterBufferTarget = ms;
      }
    } catch (err) {
      console.warn('bodyteleop: unable to apply video delay', err);
    }
  }


  setTimingSei(enabled) {
    this._sendDc('enableTimingSei', { enabled });
    if (enabled) {
      if (!this.clockSyncInterval) {
        this._sendClockPing();
        this.clockSyncInterval = setInterval(() => this._sendClockPing(), 2000);
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
      sendDelayMs: timing.sendDelayMs,
      devicePipelineMs: timing.captureMs + timing.encodeMs + timing.sendDelayMs,
      networkMs: null,
      totalMs: null,
    };

    if (this.clockSynced) {
      // Convert device wall-clock to browser wall-clock, then compute transit time
      latency.networkMs = browserReceiveMs - (timing.deviceSendWallMs - this.clockOffset);
      latency.totalMs = latency.devicePipelineMs + latency.networkMs;
    }

    this.callbacks.onLatencyUpdate?.(latency);
  }

  _sendClockPing() {
    this._sendDc('clockSync', { action: 'ping', browserSendTime: wallMs() });
  }

  _handleClockPong(data) {
    const now = wallMs();
    // how far device clock is ahead of browser clock
    // offset = deviceTime - midpoint(browserSend, browserReceive)
    this.clockOffset = data.deviceTime - (data.browserSendTime + now) / 2;
    this.clockSynced = true;
  }

  disconnect() {
    this.cleanup();
    this.callbacks.onConnectionState('disconnected');
  }

  cleanup() {
    this._clearJoystickInterval();
    this._stopVideoFrameDelay();
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
    this.videoReceiver = null;
    this._clearPendingDataChannelSends();
  }
}
