import { athena as Athena } from '@commaai/api';

// Must match TIMING_SEI_UUID in openpilot system/webrtc/device/video.py
const TIMING_SEI_UUID = new Uint8Array([
  0xa5, 0xe0, 0xc4, 0xa4, 0x5b, 0x6e, 0x4e, 0x1e,
  0x9c, 0x7e, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
]);

/** Remove H.264 emulation-prevention bytes (0x00 0x00 0x03) → (0x00 0x00). */
function unescapeRbsp(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    if (i + 2 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
      out.push(0, 0);
      i += 3;
    } else {
      out.push(data[i]);
      i += 1;
    }
  }
  return new Uint8Array(out);
}

/**
 * Extract openpilot timing metadata from an H.264 encoded frame.
 * Scans NAL units for an SEI (type 6) with user_data_unregistered (payload type 5)
 * matching our UUID, then unpacks four big-endian float64 values.
 *
 * Returns { captureMs, encodeMs, sendDelayMs, deviceSendWallMs } or null.
 */
function extractTimingSei(frameBuffer) {
  const data = new Uint8Array(frameBuffer);
  let i = 0;

  while (i < data.length - 5) {
    // Detect Annex-B start code (00 00 00 01 or 00 00 01)
    let scLen = 0;
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 0 && i + 3 < data.length && data[i + 3] === 1) scLen = 4;
      else if (data[i + 2] === 1) scLen = 3;
    }
    if (scLen === 0) { i += 1; continue; }

    const nalHeaderIdx = i + scLen;
    const nalType = data[nalHeaderIdx] & 0x1f;

    if (nalType === 6) {
      // Find end of this NAL unit (next start code or EOF)
      let nalEnd = data.length;
      for (let j = nalHeaderIdx + 1; j < data.length - 2; j++) {
        if (data[j] === 0 && data[j + 1] === 0
          && (data[j + 2] === 1 || (data[j + 2] === 0 && j + 3 < data.length && data[j + 3] === 1))) {
          nalEnd = j;
          break;
        }
      }

      // Un-escape and parse SEI RBSP (skip NAL header byte)
      const rbsp = unescapeRbsp(data.slice(nalHeaderIdx + 1, nalEnd));
      let pos = 0;

      // payload type (variable-length)
      let payloadType = 0;
      while (pos < rbsp.length && rbsp[pos] === 0xff) { payloadType += 255; pos += 1; }
      if (pos < rbsp.length) { payloadType += rbsp[pos]; pos += 1; }

      // payload size (variable-length)
      let payloadSize = 0;
      while (pos < rbsp.length && rbsp[pos] === 0xff) { payloadSize += 255; pos += 1; }
      if (pos < rbsp.length) { payloadSize += rbsp[pos]; pos += 1; }

      if (payloadType === 5 && payloadSize >= 48 && pos + 48 <= rbsp.length) {
        // Check UUID match
        let match = true;
        for (let k = 0; k < 16; k++) {
          if (rbsp[pos + k] !== TIMING_SEI_UUID[k]) { match = false; break; }
        }
        if (match) {
          const tsBytes = rbsp.slice(pos + 16, pos + 48);
          const view = new DataView(tsBytes.buffer, tsBytes.byteOffset, 32);
          return {
            captureMs: view.getFloat64(0),
            encodeMs: view.getFloat64(8),
            sendDelayMs: view.getFloat64(16),
            deviceSendWallMs: view.getFloat64(24),
          };
        }
      }
    }

    i = nalHeaderIdx + 1;
  }
  return null;
}

export function getDeviceBaseUrl(address) {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  // const port = protocol === 'https' ?  : 5002;
  const host = address.includes(':') ? address.split(':')[0] : address;
  return `${protocol}://${host}`;
}

// Returns 'trusted' if SSL handshake succeeds, 'untrusted' if the cert is
// rejected, or 'unreachable' if the device is not online at all.
export async function checkSslTrust(address) {
  try {
    await fetch(`${getDeviceBaseUrl(address)}/trust`, { mode: 'no-cors' });
    // If we get any response (even opaque), the SSL handshake succeeded
    return 'trusted';
  } catch (_) {
    // HTTPS failed — probe HTTP to distinguish "bad cert" from "device offline"
    const host = address.includes(':') ? address.split(':')[0] : address;
    try {
      await fetch(`http://${host}:5001/trust`, { mode: 'no-cors' });
      // HTTP reached the device, so it's online but the cert isn't trusted
      return 'untrusted';
    } catch (_e) {
      return 'unreachable';
    }
  }
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
    // Clock sync state (NTP-style offset between device and browser wall clocks)
    this.clockOffset = 0; // deviceClock - browserClock in ms
    this.clockSynced = false;
  }

  async connectDirect(address) {
    this.directAddress = address;
    return this.connect(null);
  }

  async connect(dongleId) {
    this.callbacks.onConnectionState('connecting');
    const t0 = performance.now();
    const log = (msg) => console.log(`[bodyteleop +${(performance.now() - t0).toFixed(0)}ms] ${msg}`);

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 1,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        encodedInsertableStreams: true,
      });

      // Diagnostic: log ICE gathering and connection state transitions
      this.pc.addEventListener('icegatheringstatechange', () => {
        log(`ICE gathering state: ${this.pc.iceGatheringState}`);
      });
      this.pc.addEventListener('iceconnectionstatechange', () => {
        log(`ICE connection state: ${this.pc.iceConnectionState}`);
      });

      this.videoTrackIndex = 0;
      this.pc.addEventListener('track', (evt) => {
        log(`track received: ${evt.track.kind}`);
        if (evt.track.kind === 'audio') {
          log('assigning audio track');
          this.callbacks.onAudioTrack?.(new MediaStream([evt.track]));
        } else if (evt.track.kind === 'video') {
          const cameraName = this.cameraOrder[this.videoTrackIndex] || `camera${this.videoTrackIndex}`;
          this.videoTrackIndex += 1;
          log(`assigning video track to camera: ${cameraName}`);
          // Minimize receiver-side buffering for low-latency playback
          if (evt.receiver) {
            if ('playoutDelayHint' in evt.receiver) {
              evt.receiver.playoutDelayHint = 0;
            }
            if ('jitterBufferTarget' in evt.receiver) {
              evt.receiver.jitterBufferTarget = 0;
            }
            // Set up Encoded Transform to extract frame-level timing SEI
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
                log('RTCRtpScriptTransform attached for latency measurement');
              } catch (e) {
                log(`RTCRtpScriptTransform setup failed: ${e.message}`);
              }
            } else if (evt.receiver.createEncodedStreams) {
              // Legacy Chrome API
              try {
                const { readable, writable } = evt.receiver.createEncodedStreams();
                const self = this;
                readable.pipeThrough(new TransformStream({
                  transform(frame, controller) {
                    self._processEncodedFrame(frame);
                    controller.enqueue(frame);
                  },
                })).pipeTo(writable);
                log('encoded transform (legacy) attached for latency measurement');
              } catch (e) {
                log(`encoded transform setup failed: ${e.message}`);
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
        log(`connection state: ${state}`);
        if (state === 'connected') {
          this.callbacks.onStatusMessage?.('Receiving video...');
          this.callbacks.onConnectionState('connected');
        }
        else if (state === 'failed' || state === 'closed') this.callbacks.onConnectionState('failed');
      });

      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      // Prefer Constrained Baseline (42e01f) with packetization-mode=1 for lowest decode latency
      h264Codecs.sort((a, b) => {
        const aProfile = a.sdpFmtpLine || '';
        const bProfile = b.sdpFmtpLine || '';
        const aIsBaseline = aProfile.includes('42e01f') || aProfile.includes('42001f');
        const bIsBaseline = bProfile.includes('42e01f') || bProfile.includes('42001f');
        const aIsPMode1 = aProfile.includes('packetization-mode=1');
        const bIsPMode1 = bProfile.includes('packetization-mode=1');
        if (aIsBaseline !== bIsBaseline) return aIsBaseline ? -1 : 1;
        if (aIsPMode1 !== bIsPMode1) return aIsPMode1 ? -1 : 1;
        return 0;
      });
      const orderedCodecs = h264Codecs.length > 0
        ? [...h264Codecs, ...codecs.filter((c) => c.mimeType !== 'video/H264')]
        : codecs;

      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (orderedCodecs.length > 0) {
        transceiver.setCodecPreferences(orderedCodecs);
      }
      this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.dc = this.pc.createDataChannel('data', { ordered: true });
      this.dc.onopen = () => {
        log('data channel opened');
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
          if (msg.type === 'activeCamera') this.callbacks.onActiveCamera?.(msg.data.camera);
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch {
          /* ignore */
        }
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      log('local description set, waiting for ICE candidates');
      this.callbacks.onStatusMessage?.('Preparing connection...');

      // Trickle ICE: resolve as soon as we get the first candidate rather than
      // waiting for all candidates to be gathered
      await Promise.race([
        new Promise((resolve) => {
          if (this.pc.iceGatheringState === 'complete') return resolve();
          let onCandidate, onComplete;
          onCandidate = (evt) => {
            if (evt.candidate) {
              log(`first ICE candidate: ${evt.candidate.type || 'unknown'} ${evt.candidate.protocol || ''}`);
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

      // Brief wait to collect a few more candidates after the first one
      await new Promise((resolve) => setTimeout(resolve, 250));
      log(`sending SDP offer (candidates in SDP: ${(this.pc.localDescription.sdp.match(/a=candidate:/g) || []).length})`);
      this.callbacks.onStatusMessage?.('Reaching device...');

      // ensure a=rtcp-mux is present on every m= section (Firefox omits it on bundled m-lines)
      const sdp = this.pc.localDescription.sdp.replace(
        /(m=(audio|video) .*\r?\n)([\s\S]*?)(?=m=|$)/g,
        (block) => block.includes('a=rtcp-mux') ? block : block.replace(/(m=(?:audio|video) [^\n]*\n)/, '$1a=rtcp-mux\r\n'),
      );
      let answerSdp;

      if (dongleId) {
        const payload = {
          method: 'startJoystickStream',
          params: { sdp },
          jsonrpc: '2.0',
          id: 0,
        };
        log('sending offer via Athena');
        const resp = await Athena.postJsonRpcPayload(dongleId, payload);
        log(`received Athena response: ${JSON.stringify(resp)}`);
        this.callbacks.onStatusMessage?.('Device responded');
        if (resp.error || !resp.result) {
          const errMsg = resp.error?.data?.message || resp.error?.message || (typeof resp.error === 'string' ? resp.error : 'No response from device');
          throw new Error(errMsg);
        }
        if (resp.result.error) {
          throw new Error(resp.result.message || resp.result.error);
        }
        answerSdp = resp.result.sdp;
        if (resp.result.activeCamera) this.callbacks.onActiveCamera?.(resp.result.activeCamera);
      } else if (this.directAddress) {
        log(`sending offer to ${this.directAddress}`);
        let resp;
        try {
          resp = await fetch(`${getDeviceBaseUrl(this.directAddress)}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp, cameras: ['driver'], bridge_services_in: ['testJoystick'], bridge_services_out: ['carState'] }),
          });
        } catch (_) {
          throw new Error('Could not reach device. Is the ignition on?');
        }
        log('received direct response');
        this.callbacks.onStatusMessage?.('Device responded');
        if (!resp.ok) {
          let errMsg = `Device returned ${resp.status}`;
          try {
            const errorBody = await resp.json();
            if (errorBody.message) {
              errMsg = errorBody.message;
            }
          } catch (_) { /* unable to parse error response */ }
          throw new Error(errMsg);
        }
        const result = await resp.json();
        if (!result.sdp) {
          throw new Error('No SDP in device response');
        }
        answerSdp = result.sdp;
        if (result.activeCamera) this.callbacks.onActiveCamera?.(result.activeCamera);
      }

      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      log('remote description set, connection establishing');
      this.callbacks.onStatusMessage?.('Establishing connection...');
    } catch (err) {
      log(`connection failed: ${err.message}`);
      this.cleanup();
      this.callbacks.onConnectionState('failed');
      throw err;
    }
  }

  async playSound(sound) {
    if (!this.directAddress) {
      throw new Error('Body sound buttons require a direct device connection.');
    }

    let resp;
    try {
      resp = await fetch(`${getDeviceBaseUrl(this.directAddress)}/sound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound }),
      });
    } catch (_) {
      throw new Error('Could not reach device sound endpoint.');
    }

    if (!resp.ok) {
      let errMsg = `Device returned ${resp.status}`;
      try {
        const errorBody = await resp.json();
        if (errorBody.message) {
          errMsg = errorBody.message;
        }
      } catch (_) { /* unable to parse error response */ }
      throw new Error(errMsg);
    }
  }

  setTimingSei(enabled) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({ type: 'enableTimingSei', data: { enabled } }));
    }
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

  switchCamera(cameraName) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({ type: 'switchCamera', data: { camera: cameraName } }));
    }
  }

  addMicTrack(track) {
    if (this.pc) {
      const audioTransceiver = this.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio');
      if (audioTransceiver) {
        audioTransceiver.sender.replaceTrack(track);
      } else {
        this.pc.addTrack(track);
      }
    }
  }

  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({ type: 'testJoystick', data: { axes: [this.joystickX, this.joystickY], buttons: [false] } }));
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
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({
        type: 'clockSync',
        data: { action: 'ping', browserSendTime: performance.timeOrigin + performance.now() },
      }));
    }
  }

  _handleClockPong(data) {
    const now = performance.timeOrigin + performance.now();
    // NTP-style offset: how far device clock is ahead of browser clock
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
