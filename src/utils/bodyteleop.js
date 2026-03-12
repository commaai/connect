import { athena as Athena } from '@commaai/api';

export class BodyTeleopConnection {
  constructor(callbacks) {
    this.pc = null;
    this.dc = null;
    this.joystickInterval = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.lastSentX = null;
    this.lastSentY = null;
    this.videoStream = null;
    this.audioStream = null;
    this.callbacks = callbacks;
  }

  async connect(dongleId) {
    this.callbacks.onConnectionState('connecting');
    try {
      this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

      this.pc.addEventListener('track', (evt) => {
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
        if (state === 'connected') this.callbacks.onConnectionState('connected');
        else if (state === 'failed' || state === 'closed') this.callbacks.onConnectionState('failed');
      });

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
      };
      this.dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data));
          if (msg.type === 'carState') this.callbacks.onBatteryLevel(Math.round(msg.data.fuelGauge * 100));
        } catch {
          /* ignore */
        }
      };

      const offer = await this.pc.createOffer({ offerToReceiveVideo: true });
      await this.pc.setLocalDescription(offer);

      await Promise.race([
        new Promise((resolve) => {
          if (this.pc.iceGatheringState === 'complete') return resolve();
          const check = () => {
            if (this.pc.iceGatheringState === 'complete') {
              this.pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }
          };
          this.pc.addEventListener('icegatheringstatechange', check);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timed out')), 10000)),
      ]);

      const payload = {
        method: 'startJoystickStream',
        params: { sdp: this.pc.localDescription.sdp },
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await Athena.postJsonRpcPayload(dongleId, payload);
      if (resp.error || !resp.result) {
        const errMsg = resp.error?.message || (typeof resp.error === 'string' ? resp.error : 'No response from device');
        throw new Error(errMsg);
      }
      await this.pc.setRemoteDescription({ type: 'answer', sdp: resp.result.sdp });
    } catch (err) {
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
      if (this.joystickX === this.lastSentX && this.joystickY === this.lastSentY) return;
      this.lastSentX = this.joystickX;
      this.lastSentY = this.joystickY;
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
