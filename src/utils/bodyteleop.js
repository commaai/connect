import { athena as Athena } from '@commaai/api';
import { extractTimingSei } from './latency-transform-worker';

export function getDeviceBaseUrl(address) {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  if (address.includes("192.168")) {
    const port = protocol === 'https' ? 5002 : 5001;
    const host = address.includes(':') ? address.split(':')[0] : address;
    return `${protocol}://${host}:${port}`;
  }
  return `${protocol}://${address}`;
}

export class BodyTeleopConnection {
  constructor(callbacks) {
    this.pc = null;
    this.dc = null;
    this.joystickInterval = null;
    this.clockSyncInterval = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.videoStreams = {};
    this.callbacks = callbacks;
    this.cameraOrder = ['camera'];
    this.videoTrackIndex = 0;
    // Clock sync state (offset between device and browser wall clocks)
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

      this.videoTrackIndex = 0;
      this.pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
          const cameraName = this.cameraOrder[this.videoTrackIndex] || `camera${this.videoTrackIndex}`;
          this.videoTrackIndex += 1;

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
                log(e)
              }
              
              
            }
          }
          this.videoStreams[cameraName] = new MediaStream([evt.track]);
          this.callbacks.onVideoTrack(cameraName, new MediaStream([evt.track]));
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
        if (this.joystickInterval) {
          clearInterval(this.joystickInterval);
          this.joystickInterval = null;
        }
        if (this.clockSyncInterval) {
          clearInterval(this.clockSyncInterval);
          this.clockSyncInterval = null;
        }
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel(Math.round(msg.data.fuelGauge * 100));
          if (msg.type === 'connectionReplaced') this.callbacks.onConnectionReplaced?.(msg.data);
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch {
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
      await new Promise((resolve) => setTimeout(resolve, 250));
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
          throw new Error(resp?.error?.message || 'No response from device');
        }
        this.callbacks.onStatusMessage?.('Device responded');
        answerSdp = resp.result.sdp;
      } else if (this.directAddress) {
        let resp;
        try {
          resp = await fetch(`${getDeviceBaseUrl(this.directAddress)}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp, cameras: ['driver'], bridge_services_in: ["testJoystick", "soundRequest", "livestreamCameraSwitch"], bridge_services_out: ['carState'] }),
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

  _sendDc(type, data) {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify({ type, data }));
      return true;
    }
    return false;
  }

  async playSound(sound) {
    if (!this._sendDc('soundRequest', { sound })) {
      throw new Error('Body sound buttons require an active teleop connection.');
    }
  }

  switchCamera(cameraName) {
    this._sendDc('livestreamCameraSwitch', { camera: cameraName });
  }

  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    this._sendDc('testJoystick', { axes: [this.joystickX, this.joystickY], buttons: [false] });
  }

  setTimingSei(enabled) {
    this._sendDc('enableTimingSei', { enabled });
    if (enabled) {
      if (!this.clockSyncInterval) {
        this._sendClockPing();
        this.clockSyncInterval = setInterval(() => this._sendClockPing(), 2000);
      }
    } else {
      if (this.clockSyncInterval) {
        clearInterval(this.clockSyncInterval);
        this.clockSyncInterval = null;
      }
      this.clockSynced = false;
    }
  }

  _processEncodedFrame(frame) {
    const timing = extractTimingSei(frame.data);
    if (timing) this._processTimingData(timing);
  }

  _processTimingData(timing) {
    const browserReceiveMs = performance.timeOrigin + performance.now();
    const latency = {
      captureMs: timing.captureMs,
      encodeMs: timing.encodeMs,
      sendDelayMs: timing.sendDelayMs,
      devicePipelineMs: timing.captureMs + timing.encodeMs + timing.sendDelayMs,
      networkMs: null,
      totalMs: null,
      clockSynced: this.clockSynced,
    };

    if (this.clockSynced) {
      // Convert device wall-clock to browser wall-clock, then compute transit time
      latency.networkMs = browserReceiveMs - (timing.deviceSendWallMs - this.clockOffset);
      latency.totalMs = latency.devicePipelineMs + latency.networkMs;
    }

    this.callbacks.onLatencyUpdate?.(latency);
  }

  _sendClockPing() {
    this._sendDc('clockSync', { action: 'ping', browserSendTime: performance.timeOrigin + performance.now() });
  }

  _handleClockPong(data) {
    const now = performance.timeOrigin + performance.now();
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
    if (this.joystickInterval) {
      clearInterval(this.joystickInterval);
      this.joystickInterval = null;
    }
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
      this.clockSyncInterval = null;
    }
    this.clockSynced = false;
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
      this.pc.getSenders().forEach((s) => {
        if (s.track) s.track.stop();
      });
      this.pc.close();
      this.pc = null;
    }
    this.videoStreams = {};
  }
}
