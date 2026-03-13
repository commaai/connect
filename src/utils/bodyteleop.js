import { athena as Athena } from '@commaai/api';

export class BodyTeleopConnection {
  constructor(callbacks) {
    this.pc = null;
    this.dc = null;
    this.joystickInterval = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.videoStream = null;
    this.audioStream = null;
    this.callbacks = callbacks;
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
      });

      // Diagnostic: log ICE gathering and connection state transitions
      this.pc.addEventListener('icegatheringstatechange', () => {
        log(`ICE gathering state: ${this.pc.iceGatheringState}`);
      });
      this.pc.addEventListener('iceconnectionstatechange', () => {
        log(`ICE connection state: ${this.pc.iceConnectionState}`);
      });

      this.pc.addEventListener('track', (evt) => {
        log(`track received: ${evt.track.kind}`);
        if (evt.track.kind === 'video') {
          this.videoStream = evt.streams[0];
          this.callbacks.onVideoTrack(evt.streams[0]);
        } else if (evt.track.kind === 'audio') {
          this.audioStream = evt.streams[0];
          this.callbacks.onAudioTrack(evt.streams[0]);
        }
      });

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        log(`connection state: ${state}`);
        if (state === 'connected') this.callbacks.onConnectionState('connected');
        else if (state === 'failed' || state === 'closed') this.callbacks.onConnectionState('failed');
      });

      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      if (h264Codecs.length > 0) {
        const otherCodecs = codecs.filter((c) => c.mimeType !== 'video/H264');
        transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
      }

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

      // Trickle ICE: resolve as soon as we get the first candidate rather than
      // waiting for all candidates to be gathered
      await Promise.race([
        new Promise((resolve) => {
          if (this.pc.iceGatheringState === 'complete') return resolve();
          const onCandidate = (evt) => {
            if (evt.candidate) {
              log(`first ICE candidate: ${evt.candidate.type || 'unknown'} ${evt.candidate.protocol || ''}`);
              this.pc.removeEventListener('icecandidate', onCandidate);
              this.pc.removeEventListener('icegatheringstatechange', onComplete);
              resolve();
            }
          };
          const onComplete = () => {
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

      const sdp = this.pc.localDescription.sdp;
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
        if (resp.error || !resp.result) {
          const errMsg = resp.error?.message || (typeof resp.error === 'string' ? resp.error : 'No response from device');
          throw new Error(errMsg);
        }
        answerSdp = resp.result.sdp;
      } else if (this.directAddress) {
        log(`sending offer to ${this.directAddress}`);
        const resp = await fetch(`http://${this.directAddress}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp, cameras: ["driver"], bridge_services_in: ["testJoystick"], bridge_services_out: ["carState"] }),
        });
        log('received direct response');
        if (!resp.ok) {
          throw new Error(`Device returned ${resp.status}`);
        }
        const result = await resp.json();
        if (!result.sdp) {
          throw new Error('No SDP in device response');
        }
        answerSdp = result.sdp;
      }

      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      log('remote description set, connection establishing');
    } catch (err) {
      log(`connection failed: ${err.message}`);
      this.cleanup();
      this.callbacks.onConnectionState('failed');
      throw err;
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
    this.videoStream = null;
    this.audioStream = null;
  }
}
