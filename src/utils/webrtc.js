import { athena as Athena } from '@commaai/api';
import { asyncSleep } from '.';

const VIDEO_STREAM_NAME = 'camera';
const DEFAULT_SPEAKER_VOLUME = 100;
const wallMs = () => performance.timeOrigin + performance.now();

const CLOCK_WINDOW_SIZE = 16;
const CLOCK_PING_MS = 500;

const CONNECTION_DEADLINE_MS = 10000;
const ICE_GATHER_DEADLINE_MS = 8000;

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

function summarizeAudioSdp(sdp) {
  if (!sdp) return 'none';
  const media = sdp.split(/\r\nm=|\nm=/).filter((section) => section.startsWith('audio '));
  if (media.length === 0) return 'none';
  return media.map((section, idx) => {
    const lines = section.split(/\r\n|\n/);
    const direction = lines.find((line) => /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(line))?.slice(2) ?? 'sendrecv';
    const codecs = lines
      .filter((line) => line.startsWith('a=rtpmap:'))
      .map((line) => line.split(' ')[1])
      .filter(Boolean)
      .join(',');
    return `${idx}:direction=${direction} codecs=${codecs || 'none'}`;
  }).join('; ');
}

function summarizeAudioTransceivers(pc) {
  const transceivers = pc?.getTransceivers?.().filter((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio') ?? [];
  if (transceivers.length === 0) return 'none';
  return transceivers.map((t, idx) => (
    `${idx}:direction=${t.direction} currentDirection=${t.currentDirection} `
      + `sender_track=${t.sender?.track?.kind ?? 'none'} receiver_track=${t.receiver?.track?.kind ?? 'none'}`
  )).join('; ');
}

export class WebRTCConnection extends EventTarget {
  constructor(callbacks) {
    super();
    this.streamTimings = null;
    this.pc = null;
    this.dc = null;
    this.localAudioStream = null;
    this.audioSender = null;
    this.audioTestTone = null;
    this.silentAudio = null;
    this.audioStatsInterval = null;
    this.lastAudioStats = null;
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
    this.videoTimingReceivers = new WeakSet();
    this.videoEnabled = false;
    this.audioEnabled = false;
    this.speakerVolume = DEFAULT_SPEAKER_VOLUME;
    this.connectionState = 'new';
    this.failReason = null;
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

  async connect(dongleId, videoEnabled = false, audioEnabled = false) {
    this.cleanup();
    this._setState('connecting');
    this.connectStartedAt = performance.now();
    this.streamTimings = null;
    this.videoEnabled = videoEnabled;
    this.audioEnabled = false;

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: "require",
      });
      this._log('RTCPeerConnection created');
      const pc = this.pc;
      
      this.pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
          if (evt.receiver) {
            this._setupVideoReceiver(evt.receiver);
          }
          const stream = new MediaStream([evt.track]);
          this.callbacks.onVideoTrack(VIDEO_STREAM_NAME, stream);
        } else if (evt.track.kind === 'audio') {
          if (evt.receiver) {
            this._setupAudioReceiver(evt.receiver);
          }
          const stream = new MediaStream([evt.track]);
          this.callbacks.onAudioTrack?.(stream);
        }
      });

      this.pc.addEventListener('connectionstatechange', () => {
        if (!this.pc) return;
        const state = this.pc.connectionState;
        this._log(`Connection state: ${state}`);
        if (state === 'connected') {
          this._clearConnectionTimeout();
          this._setState('connected');
          this._startAudioStats();
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          // A drop after we were connected is a lost connection (offer "Reconnect");
          // a drop while still connecting is a failure to connect (offer "Retry").
          if (this.connectionState === 'connected') {
            this.disconnect('Connection lost');
          } else {
            this.fail('Connection lost');
          }
        }
      });

      // set up video channel
      const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
      const h264Codecs = codecs.filter((c) => c.mimeType === 'video/H264');
      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (h264Codecs.length > 0) transceiver.setCodecPreferences(h264Codecs);
      this._setupVideoReceiver(transceiver.receiver);

      await this._setupAudioForOffer(pc, audioEnabled);
      if (this.pc !== pc) return;

      this.connectionTimeout = setTimeout(() => {
        this.fail('No direct peer-to-peer routes were found to device. Check network and retry.');
      }, CONNECTION_DEADLINE_MS);

      // set up data channel
      this.dc = this.pc.createDataChannel('data', { ordered: true });
      this.dc.onopen = () => {
        this._log('Data channel open');
        this._sendSpeakerVolume();
        if (this.videoEnabled) {
          this._sendDc('livestreamVideoEnable', { enabled: true });
          this.enableJoystick(true);
        }
        if (this.audioEnabled) {
          this.enableAudioCapture(this.speakerVolume > 0);
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
          if (msg.type === 'clockSync' && msg.data?.action === 'pong') this._handleClockPong(msg.data);
        } catch (e) {
          console.warn('webrtc: ignoring malformed data-channel message', e);
        }
      };

      const offer = await this.pc.createOffer();
      if (this.pc !== pc) return;
      await this.pc.setLocalDescription(offer);
      if (this.pc !== pc) return;
      console.log('webrtc audio negotiation offer', {
        requested: audioEnabled,
        enabled: this.audioEnabled,
        hasAudioSender: !!this.audioSender,
        localAudioTracks: this.localAudioStream?.getAudioTracks().length ?? 0,
        offerAudio: summarizeAudioSdp(pc.localDescription?.sdp),
        transceivers: summarizeAudioTransceivers(pc),
      });
      this._log('create offer and setLocalDescription done');

      const candidateReady = new Promise((resolve) => {
        pc.addEventListener('icecandidate', (evt) => {
          if (!evt.candidate) {
            this._log('ICE gathering complete');
            resolve();
          } else if (['srflx', 'prflx', 'relay'].includes(evt.candidate.type)) {
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
        params: { sdp: stripMdnsCandidates(pc.localDescription.sdp), enabled: this.videoEnabled, audio: this.audioEnabled },
        jsonrpc: '2.0',
        id: 0,
      });
      const rttMs = performance.now() - tStep;
      if (resp == null) {
        this._log(`device error: ${JSON.stringify(resp.error)}`);
        throw new Error('Device could not be reached. Is it online and connected to the internet?');
      }
      if (resp?.error) {
        this._log(`device error: ${JSON.stringify(resp.error)}`);
        throw new Error(resp.error.data?.message || 'Could not reach device. Is the ignition on?');
      }
      // device reports how long it spent handling startStream; the rest of the RTT is the link
      const deviceProcessMs = typeof resp.result.time === 'number' ? resp.result.time : null;
      const linkMs = deviceProcessMs != null ? Math.max(0, rttMs - deviceProcessMs) : null;
      this.streamTimings = { startStreamRttMs: rttMs, deviceProcessMs, linkMs };
      this._log(
        `Received startStream answer. RTT ${rttMs.toFixed(0)}ms`
          + (deviceProcessMs != null ? `, link ${linkMs.toFixed(0)}ms, device processing ${deviceProcessMs.toFixed(0)}ms` : ''),
      );
      console.log('webrtc audio negotiation answer', {
        requested: audioEnabled,
        enabled: this.audioEnabled,
        hasAudioSender: !!this.audioSender,
        answerAudio: summarizeAudioSdp(resp.result?.sdp),
      });
      
      // device refuses the stream when another client already holds it; fail this connection
      if (resp.result?.error === 'busy') {
        this.fail(resp.result.message || 'Device is busy with another session.');
        return;
      }

      if (this.pc !== pc) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: resp.result.sdp });
      console.log('webrtc audio negotiation complete', {
        requested: audioEnabled,
        enabled: this.audioEnabled,
        hasAudioSender: !!this.audioSender,
        localAudioTracks: this.localAudioStream?.getAudioTracks().length ?? 0,
        remoteAudioReceivers: pc.getReceivers?.().filter((r) => r.track?.kind === 'audio').length ?? 0,
        transceivers: summarizeAudioTransceivers(pc),
      });
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

  _sendSpeakerVolume() {
    return this._sendDc('speakerVolume', { volume: this.speakerVolume });
  }

  setSpeakerVolume(volume) {
    const numericVolume = Number(volume);
    if (!Number.isFinite(numericVolume)) return false;
    this.speakerVolume = Math.max(0, Math.min(100, Math.round(numericVolume)));
    if (this.audioEnabled) {
      this.enableAudioCapture(this.speakerVolume > 0);
    }
    return this._sendSpeakerVolume();
  }

  _createTimingWorker() {
    const worker = new Worker(
      new URL('./latency-transform-worker.js', import.meta.url),
      { type: 'module' },
    );
    this.transformWorkers.push(worker);
    worker.onmessage = (e) => {
      if (e.data.type === 'timing') {
        this._processTimingData(e.data.timing);
      } else if (e.data.type === 'error') {
        this._log(`Video timing transform failed: ${e.data.message}`);
      }
    };
    return worker;
  }

  _discardTimingWorker(worker) {
    const idx = this.transformWorkers.indexOf(worker);
    if (idx !== -1) this.transformWorkers.splice(idx, 1);
    worker.terminate();
  }

  _setupVideoReceiver(receiver) {
    // hints: minimize receiver-side buffering on Chrome
    if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
    if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
    this._setupVideoTimingTransform(receiver);
  }

  _setupAudioReceiver(receiver) {
    if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
    if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
  }

  _setupVideoTimingTransform(receiver) {
    if (this.videoTimingReceivers.has(receiver)) return;

    const ScriptTransform = typeof window !== 'undefined' ? window.RTCRtpScriptTransform : undefined;
    const supportsScriptTransform = typeof ScriptTransform !== 'undefined' && 'transform' in receiver;
    const supportsLegacyStreams = typeof receiver.createEncodedStreams === 'function';
    if (!supportsScriptTransform && !supportsLegacyStreams) return;

    let worker;
    try {
      worker = this._createTimingWorker();
      if (supportsScriptTransform) {
        receiver.transform = new ScriptTransform(worker);
      } else {
        const { readable, writable } = receiver.createEncodedStreams();
        worker.postMessage({ type: 'encodedVideoStreams', readable, writable }, [readable, writable]);
      }
      this.videoTimingReceivers.add(receiver);
    } catch (e) {
      if (worker) this._discardTimingWorker(worker);
      this._log(`Video timing transform unavailable: ${e?.message || e?.name || e}`);
    }
  }

  async _setupAudioForOffer(pc, audioEnabled) {
    if (!audioEnabled) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this._log('Microphone API unavailable');
      return;
    }

    try {
      this._log('Requesting microphone access');
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      console.log('webrtc audio local setup failed', e);
      this._log(`Microphone unavailable: ${e?.message || e?.name || e}`);
      throw e;
    }

    if (this.pc !== pc) return;

    const [track] = this.localAudioStream.getAudioTracks();
    if (!track) {
      console.log('webrtc audio local setup', {
        requested: audioEnabled,
        enabled: false,
        tracks: [],
      });
      this._log('Microphone stream had no audio tracks');
      return;
    }

    const audioTransceiver = this.pc.addTransceiver(track, {
      direction: 'sendrecv',
      streams: [this.localAudioStream],
    });
    this._setupAudioReceiver(audioTransceiver.receiver);
    this.audioSender = audioTransceiver.sender;
    this.audioEnabled = true;
    this._configureAudioSenderForVideoPriority().catch(() => {});
    console.log('webrtc audio local setup', {
      requested: audioEnabled,
      enabled: this.audioEnabled,
      hasAudioSender: !!this.audioSender,
      tracks: this.localAudioStream.getAudioTracks().map((audioTrack) => ({
        id: audioTrack.id,
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState,
        settings: audioTrack.getSettings?.(),
      })),
    });
    this._log(`Microphone track added to offer: id=${track.id} state=${track.readyState} muted=${track.muted}`);
  }

  _startAudioStats() {
    if (!this.audioEnabled || !this.audioSender || this.audioStatsInterval) return;

    const sample = async () => {
      if (!this.pc || !this.audioSender) return;

      let stats;
      try {
        stats = await this.pc.getStats(this.audioSender);
      } catch (e) {
        return;
      }

      for (const report of stats.values()) {
        if (report.type !== 'outbound-rtp' || report.kind !== 'audio') continue;

        const packets = report.packetsSent ?? 0;
        const bytes = report.bytesSent ?? 0;
        const last = this.lastAudioStats;
        if (!last || packets !== last.packets || bytes !== last.bytes) {
          console.log('webrtc audio outbound stats', {
            packets,
            bytes,
            trackState: this.audioSender.track?.readyState,
            trackMuted: this.audioSender.track?.muted,
            transceivers: summarizeAudioTransceivers(this.pc),
          });
          this._log(`Browser outbound audio RTP: packets=${packets} bytes=${bytes}`);
          this.lastAudioStats = { packets, bytes };
        }
        return;
      }
    };

    sample();
    this.audioStatsInterval = setInterval(sample, 1000);
  }

  async _configureAudioSenderForVideoPriority() {
    if (!this.audioSender?.getParameters || !this.audioSender?.setParameters) return;

    const params = this.audioSender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    for (const encoding of params.encodings) {
      encoding.dtx = 'enabled';
      encoding.maxBitrate = Math.min(encoding.maxBitrate ?? 24000, 24000);
      encoding.priority = 'very-low';
    }

    await this.audioSender.setParameters(params);
  }

  _silentAudioTrack() {
    const track = this.silentAudio?.track;
    if (track?.readyState === 'live') return track;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    context.resume().catch((e) => this._log(`Silent audio context suspended: ${e?.message || e?.name || e}`));

    const [silentTrack] = destination.stream.getAudioTracks();
    this.silentAudio = { context, oscillator, stream: destination.stream, track: silentTrack };
    return silentTrack;
  }

  async _setupAudio() {
    if (this.localAudioStream?.active && this._micTrack()) return;
    if (!this.audioSender) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this._log('Microphone API unavailable');
      return;
    }

    try {
      this._log('Requesting microphone access');
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      this._log(`Microphone unavailable: ${e?.message || e?.name || e}`);
    }

    const [track] = this.localAudioStream?.getAudioTracks?.() || [];
    if (track && this.audioSender) {
      await this.audioSender.replaceTrack(track);
      await this._configureAudioSenderForVideoPriority().catch(() => {});
      this._log('Microphone track enabled');
    } else if (track) {
      this.audioSender = this.pc.addTrack(track, this.localAudioStream);
      this._log('Microphone track added');
    } else {
      this._log('Microphone stream had no audio tracks');
    }
  }

  enableAudioCapture(enabled) {
    if (!this.audioEnabled || !this.pc) return;

    if (enabled) {
      this._setupAudio().catch((e) => this._log(`Microphone unavailable: ${e?.message || e?.name || e}`));
      return;
    }

    this._stopTestTone(false);
    const stream = this.localAudioStream;
    this.localAudioStream = null;
    stream?.getTracks().forEach((track) => track.stop());
    this.audioSender?.replaceTrack(this._silentAudioTrack()).catch(() => {});
  }

  _micTrack() {
    return this.localAudioStream?.getAudioTracks?.().find((track) => track.readyState === 'live') || null;
  }

  _stopTestTone(restoreMic = true) {
    const tone = this.audioTestTone;
    if (!tone) return;

    this.audioTestTone = null;
    clearTimeout(tone.timeout);
    try {
      tone.oscillator.stop();
    } catch (e) {
      // already stopped
    }
    tone.track.stop();
    tone.context.close().catch(() => {});

    if (restoreMic) {
      this.audioSender?.replaceTrack(this._micTrack() || this._silentAudioTrack()).catch(() => {});
    }
  }

  async sendTestTone(frequency, durationMs = 1000) {
    this._sendDc('audioTestTone', {
      frequency,
      durationMs,
      audioEnabled: this.audioEnabled,
      hasAudioSender: !!this.audioSender,
      connectionState: this.connectionState,
    });

    if (!this.audioEnabled || !this.pc || !this.audioSender) return false;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    this._stopTestTone(false);

    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    const micTrack = this._micTrack();
    if (micTrack) {
      context.createMediaStreamSource(new MediaStream([micTrack])).connect(destination);
    }

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.2;
    oscillator.connect(gain).connect(destination);

    const [track] = destination.stream.getAudioTracks();
    await this.audioSender.replaceTrack(track);
    await context.resume();
    oscillator.start();

    const timeout = setTimeout(() => this._stopTestTone(true), durationMs);
    this.audioTestTone = { context, oscillator, track, timeout };
    return true;
  }

  // Pulsed burst for speaker->mic delay calibration (openpilot tools/audio/audio_delay.py).
  // Emits sharp-onset bursts (~150 ms) once per second so the tool's burst detector has clean,
  // well-separated events. The mic is intentionally left out so the silence between bursts stays
  // quiet. With sweep=false it's a fixed tone (robust through a frequency-selective, faint-echo
  // acoustic path). With sweep=true each burst is a chirp: a chirp has a single sharp
  // autocorrelation peak (no periodic sidelobes, so no flipping-sign / ms-level lag ambiguity),
  // but a peaky speaker/room response distorts the swept template and can drop the correlation
  // below the tool's gate — prefer the fixed tone unless the echo is strong.
  async sendDelayTone(frequency = 1000, { pulseMs = 150, periodMs = 1000, durationMs = 20000, sweep = false } = {}) {
    // When sweeping, cover half an octave below to one octave above the requested frequency, kept
    // inside the 16 kHz mic's 8 kHz Nyquist so the reference isn't aliased on the device side.
    const f0 = sweep ? Math.max(200, frequency * 0.5) : frequency;
    const f1 = sweep ? Math.min(4000, frequency * 2) : frequency;

    this._sendDc('audioTestTone', {
      mode: sweep ? 'chirp' : 'pulsed',
      frequency,
      sweepHz: [f0, f1],
      pulseMs,
      periodMs,
      durationMs,
      audioEnabled: this.audioEnabled,
      hasAudioSender: !!this.audioSender,
      connectionState: this.connectionState,
    });

    if (!this.audioEnabled || !this.pc || !this.audioSender) return false;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    this._stopTestTone(false);

    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = f0;
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);

    const [track] = destination.stream.getAudioTracks();
    await this.audioSender.replaceTrack(track);
    await context.resume();

    // Schedule the pulses on the AudioContext clock so onsets are sample-accurate and glitch-free.
    // Short (4 ms) raised edges keep the onset sharp for the RMS burst detector while avoiding
    // speaker clicks that would smear the cross-correlation.
    const EDGE_S = 0.004;
    const PEAK = 0.2;
    const period = Math.max(periodMs, pulseMs + 50) / 1000;
    const pulse = Math.min(pulseMs, periodMs) / 1000;
    const count = Math.max(1, Math.floor(durationMs / (period * 1000)));
    const start = context.currentTime + 0.05;

    gain.gain.setValueAtTime(0, context.currentTime);
    oscillator.frequency.setValueAtTime(f0, context.currentTime);
    for (let i = 0; i < count; i += 1) {
      const t0 = start + i * period;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(PEAK, t0 + EDGE_S);
      gain.gain.setValueAtTime(PEAK, t0 + pulse - EDGE_S);
      gain.gain.linearRampToValueAtTime(0, t0 + pulse);
      if (sweep) {
        // sweep f0 -> f1 across the burst, then jump back to f0 during the silent gap
        oscillator.frequency.setValueAtTime(f0, t0);
        oscillator.frequency.linearRampToValueAtTime(f1, t0 + pulse);
      }
    }
    oscillator.start();

    const timeout = setTimeout(() => this._stopTestTone(true), count * period * 1000 + 200);
    this.audioTestTone = { context, oscillator, track, timeout };
    return true;
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
      source: 'sei',
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
    this._clearConnectionTimeout();
    this.enableJoystick(false);
    this._stopClockSync();
    if (this.audioStatsInterval) {
      clearInterval(this.audioStatsInterval);
      this.audioStatsInterval = null;
    }
    this.lastAudioStats = null;
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
    this.enableAudioCapture(false);
    if (this.silentAudio) {
      try {
        this.silentAudio.oscillator.stop();
      } catch (e) {
        // already stopped
      }
      this.silentAudio.track.stop();
      this.silentAudio.context.close().catch(() => {});
      this.silentAudio = null;
    }
    this.audioSender = null;
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

// Holds the active WebRTCConnection.
export class WebRTCConnectionManager {
  constructor() {
    this.connection = null;
    this.dongleId = null;
    this.subscriber = null;
    this.videoWanted = false;
    this.audioWanted = false;
    this.battery = null;
    this.stream = null;
    this.streamName = null;
    this.audioStream = null;
    this.awayTimer = null;
    this.speakerVolume = DEFAULT_SPEAKER_VOLUME;

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

  _open(dongleId, videoEnabled = false, audioEnabled = false) {
    this.disconnect();
    this.dongleId = dongleId;
    this.audioWanted = audioEnabled;
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
      onAudioTrack: guard((stream) => {
        this.audioStream = stream;
        this.subscriber?.onAudioTrack?.(stream);
      }),
      onLatencyUpdate: guard((latency) => {
        this.subscriber?.onLatencyUpdate?.(latency);
      }),
      onIgnition: guard((ignition) => {
        this.subscriber?.onIgnition?.(ignition);
      }),
    });
    this.connection = conn;
    conn.setSpeakerVolume(this.speakerVolume);
    conn.connect(dongleId, videoEnabled, audioEnabled).catch(() => {});
  }

  acquire(dongleId, callbacks, audioEnabled = false) {
    const shouldOpen = !this._healthy(dongleId) || (audioEnabled && !this.connection?.audioEnabled);
    if (shouldOpen) {
      this._open(dongleId, true, audioEnabled);
    }
    this.setVideoEnabled(true);
    this.setJoystickEnabled(true);
    if (audioEnabled && this.connection?.audioEnabled) this.connection.enableAudioCapture(this.speakerVolume > 0);
    this.audioWanted = audioEnabled;
    this.subscriber = callbacks;
    callbacks?.onConnectionState?.(this.connectionState, this.failReason);
    if (this.battery != null) callbacks?.onBatteryLevel?.(this.battery);
    if (this.stream) callbacks?.onVideoTrack?.(this.streamName, this.stream);
    if (this.audioStream) callbacks?.onAudioTrack?.(this.audioStream);
    return this.connection;
  }

  release(callbacks) {
    if (callbacks && this.subscriber !== callbacks) return;
    this.subscriber = null;
    this.audioWanted = false;
    this.disconnect('Teleop closed');
  }

  reconnect(dongleId, audioEnabled = this.audioWanted) {
    this._open(dongleId ?? this.dongleId, true, audioEnabled);
    this.setVideoEnabled(true);
    this.setJoystickEnabled(true);
    if (audioEnabled && this.connection?.audioEnabled) this.connection.enableAudioCapture(this.speakerVolume > 0);
    this.audioWanted = audioEnabled;
    return this.connection;
  }

  _teardown(reason) {
    clearTimeout(this.awayTimer);
    this.videoWanted = false;
    this.audioWanted = false;
    if (this.connection) {
      this.connection.disconnect(reason);
      this.connection = null;
    }
    this.battery = null;
    this.stream = null;
    this.streamName = null;
    this.audioStream = null;
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

  setSpeakerVolume(volume) {
    const numericVolume = Number(volume);
    if (!Number.isFinite(numericVolume)) return false;
    this.speakerVolume = Math.max(0, Math.min(100, Math.round(numericVolume)));
    if (this.connection) {
      return this.connection.setSpeakerVolume(this.speakerVolume);
    }
    return false;
  }

  setJoystickEnabled(enabled) {
    if (this.connection && this.connectionState === 'connected') {
      this.connection.enableJoystick(enabled);
    }
  }
}

export const webrtcConnectionManager = new WebRTCConnectionManager();
