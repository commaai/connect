import { athena as Athena } from '@commaai/api';

export function getDeviceBaseUrl(address) {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const port = protocol === 'https' ? 5002 : 5001;
  const host = address.includes(':') ? address.split(':')[0] : address;
  return `${protocol}://${host}:${port}`;
}

export async function checkSslTrust(address) {
  try {
    await fetch(`${getDeviceBaseUrl(address)}/trust`, { mode: 'no-cors' });
    // If we get any response (even opaque), the SSL handshake succeeded
    return true;
  } catch (_) {
    return false;
  }
}

export class BodyTeleopConnection {
  constructor(callbacks) {
    this.pc = null;
    this.dc = null;
    this.audioTransceiver = null;
    this.joystickInterval = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.videoStreams = {};
    this.audioStream = null;
    this.localMicStream = null;
    this.localMicTrack = null;
    this.silentAudioContext = null;
    this.silentAudioDestination = null;
    this.silentAudioGain = null;
    this.silentAudioOscillator = null;
    this.silentAudioTrack = null;
    this.callbacks = callbacks;
    this.cameraOrder = ['driver', 'wideRoad'];
    this.videoTrackIndex = 0;
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
        if (evt.track.kind === 'video') {
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
          }
          this.videoStreams[cameraName] = new MediaStream([evt.track]);
          this.callbacks.onVideoTrack(cameraName, new MediaStream([evt.track]));
        } else if (evt.track.kind === 'audio') {
          // Minimize receiver-side buffering for low-latency audio playback
          if (evt.receiver) {
            if ('playoutDelayHint' in evt.receiver) {
              evt.receiver.playoutDelayHint = 0;
            }
            if ('jitterBufferTarget' in evt.receiver) {
              evt.receiver.jitterBufferTarget = 0;
            }
          }
          this.audioStream = evt.streams[0] || new MediaStream([evt.track]);
          this.callbacks.onAudioTrack(this.audioStream);
        }
      });

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        log(`connection state: ${state}`);
        if (state === 'connected') {
          this.callbacks.onStatusMessage?.('Receiving video...');
          this.callbacks.onConnectionState('connected');
          this.ensureSilentAudioTrack().then((track) => {
            if (track && this.audioTransceiver) {
              this.audioTransceiver.sender.replaceTrack(track);
            }
          }).catch(() => {});
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

      for (let i = 0; i < this.cameraOrder.length; i++) {
        const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
        if (orderedCodecs.length > 0) {
          transceiver.setCodecPreferences(orderedCodecs);
        }
      }
      this.audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });

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
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel(Math.round(msg.data.fuelGauge * 100));
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
      } else if (this.directAddress) {
        log(`sending offer to ${this.directAddress}`);
        let resp;
        try {
          resp = await fetch(`${getDeviceBaseUrl(this.directAddress)}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp, cameras: this.cameraOrder, bridge_services_in: ['testJoystick'], bridge_services_out: ['carState'] }),
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

  async ensureSilentAudioTrack() {
    if (this.silentAudioTrack && this.silentAudioTrack.readyState === 'live') {
      return this.silentAudioTrack;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!this.silentAudioContext) {
      this.silentAudioContext = new AudioContextClass();
    }

    this.silentAudioDestination = this.silentAudioContext.createMediaStreamDestination();
    this.silentAudioOscillator = this.silentAudioContext.createOscillator();
    this.silentAudioGain = this.silentAudioContext.createGain();
    this.silentAudioGain.gain.value = 0;
    this.silentAudioOscillator.connect(this.silentAudioGain);
    this.silentAudioGain.connect(this.silentAudioDestination);
    this.silentAudioOscillator.start();
    await this.silentAudioContext.resume().catch(() => {});

    [this.silentAudioTrack] = this.silentAudioDestination.stream.getAudioTracks();
    return this.silentAudioTrack;
  }

  async ensureMicrophoneTrack() {
    if (this.localMicTrack && this.localMicTrack.readyState === 'live') {
      return this.localMicTrack;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }

    this.localMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    [this.localMicTrack] = this.localMicStream.getAudioTracks();
    return this.localMicTrack;
  }

  async setMicrophoneMuted(muted) {
    if (muted) {
      if (this.localMicStream) {
        this.localMicStream.getTracks().forEach((track) => track.stop());
        this.localMicStream = null;
      }
      this.localMicTrack = null;
      if (this.audioTransceiver) {
        const silentTrack = await this.ensureSilentAudioTrack();
        if (silentTrack) {
          await this.audioTransceiver.sender.replaceTrack(silentTrack);
        }
      }
      return;
    }

    const micTrack = await this.ensureMicrophoneTrack();
    micTrack.enabled = true;
    if (this.audioTransceiver) {
      await this.audioTransceiver.sender.replaceTrack(micTrack);
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

  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
  }

  sendJoystick() {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify({ type: 'testJoystick', data: { axes: [this.joystickX, this.joystickY], buttons: [false] } }));
    }
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
    if (this.localMicStream) {
      this.localMicStream.getTracks().forEach((track) => track.stop());
      this.localMicStream = null;
    }
    this.localMicTrack = null;
    if (this.silentAudioTrack) {
      this.silentAudioTrack.stop();
      this.silentAudioTrack = null;
    }
    if (this.silentAudioOscillator) {
      try {
        this.silentAudioOscillator.stop();
      } catch (_) {
        /* already stopped */
      }
      this.silentAudioOscillator.disconnect();
      this.silentAudioOscillator = null;
    }
    if (this.silentAudioGain) {
      this.silentAudioGain.disconnect();
      this.silentAudioGain = null;
    }
    if (this.silentAudioDestination) {
      this.silentAudioDestination.disconnect?.();
      this.silentAudioDestination = null;
    }
    if (this.silentAudioContext) {
      this.silentAudioContext.close().catch(() => {});
      this.silentAudioContext = null;
    }
    this.audioTransceiver = null;
    this.videoStreams = {};
    this.audioStream = null;
  }
}
