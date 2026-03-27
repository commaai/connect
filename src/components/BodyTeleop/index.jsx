import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Typography, Button, IconButton } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import InfoOutline from '@material-ui/icons/InfoOutline';
import BatteryFull from '@material-ui/icons/BatteryFull';
import PhotoCamera from '@material-ui/icons/PhotoCamera';
import VolumeUp from '@material-ui/icons/VolumeUp';
import VolumeOff from '@material-ui/icons/VolumeOff';
import Mic from '@material-ui/icons/Mic';
import MicOff from '@material-ui/icons/MicOff';

import Colors from '../../colors';
import { deviceNamePretty } from '../../utils';
import { BodyTeleopConnection } from '../../utils/bodyteleop';
import { ArrowBackBold } from '../../icons';

import styles from "./styles"

const QUICK_SOUNDS = [
  { key: 'engage', label: 'Engage' },
  { key: 'disengage', label: 'Disengage' },
  { key: 'prompt', label: 'Prompt' },
  { key: 'warning', label: 'Warning' },
];

const CAMERAS = [
  { key: 'wideRoad', label: 'road', num: '1' },
  { key: 'driver', label: 'driver', num: '2' },
];

class BodyTeleop extends Component {
  constructor(props) {
    super(props);

    this.state = {
      connectionState: 'disconnected',
      statusMessage: null,
      connectProgress: 0,
      batteryLevel: null,
      error: null,
      isLandscape: false,
      thumbPos: null,
      keys: { w: false, a: false, s: false, d: false },
      showStats: false,
      stats: null,
      latency: null,
      latencyHistory: [],  // ring buffer of last 90 samples (~3s at 30fps)
      videoAspectRatio: '16/9',
      activeCamera: 'wideRoad',
      gamepadConnected: false,
      gamepadSteering: 0,
      gamepadGas: 0,
      gamepadBrake: 0,
      gamepadLB: false,
      gamepadRB: false,
      showSslTrust: false,
      streamMuted: true,
      micMuted: true,
      micPermission: null,
      micLevel: 0,
      remoteAudioLevel: 0,
    };

    this.videoRef = React.createRef();
    this.audioRef = React.createRef();
    this.joystickAreaRef = React.createRef();
    this.latencyCanvasRef = React.createRef();
    this.touchId = null;
    this.mouseDragging = false;
    this.streams = {};
    this._switchCameraTimer = null;

    this.connection = new BodyTeleopConnection({
      onConnectionState: (connectionState) => {
        this.setState({
          connectionState,
          ...(connectionState !== 'connecting' ? { statusMessage: null, connectProgress: 0 } : {}),
        });
      },
      onStatusMessage: (statusMessage) => {
        const progressMap = {
          'Preparing connection...': 10,
          'Finding network path...': 20,
          'Reaching device...': 30,
          'Device responded': 85,
          'Establishing connection...': 92,
          'Receiving video...': 97,
        };
        this.setState({ statusMessage, connectProgress: progressMap[statusMessage] || 0 });
      },
      onBatteryLevel: (batteryLevel) => this.setState({ batteryLevel }),
      onActiveCamera: (camera) => this.setState({ activeCamera: camera }),
      onVideoTrack: (_cameraName, stream) => {
        this.streams.camera = stream;
        if (this.videoRef.current) {
          this.videoRef.current.srcObject = stream;
        }
      },
      onAudioTrack: (stream) => {
        if (this.audioRef.current) {
          this.audioRef.current.srcObject = stream;
        }
        this._monitorRemoteAudio(stream);
      },
      onLatencyUpdate: (latency) => {
        // Accumulate frames into a buffer, average every 10 frames (~0.5s at 20fps)
        if (!this._latencyBuffer) this._latencyBuffer = [];
        this._latencyBuffer.push(latency);
        if (this._latencyBuffer.length >= 10) {
          const buf = this._latencyBuffer;
          this._latencyBuffer = [];
          const avg = {};
          for (const key of ['captureMs', 'encodeMs', 'sendDelayMs', 'devicePipelineMs', 'networkMs', 'totalMs']) {
            const vals = buf.map((l) => l[key]).filter((v) => v != null);
            avg[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          }
          avg.clockSynced = buf[buf.length - 1].clockSynced;
          this.setState((prev) => {
            const history = [...prev.latencyHistory, avg].slice(-60);
            return { latency: avg, latencyHistory: history };
          });
        }
      },
    });

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.onLandscapeChange = this.onLandscapeChange.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.pollGamepad = this.pollGamepad.bind(this);
    this.handlePlaySound = this.handlePlaySound.bind(this);
    this.toggleStreamMuted = this.toggleStreamMuted.bind(this);
    this.handleMicToggle = this.handleMicToggle.bind(this);
    this.onVideoResize = this.onVideoResize.bind(this);

    this.gamepadAnimFrame = null;
    this.prevBumpers = { lb: false, rb: false };
  }

  componentDidMount() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.landscapeQuery = window.matchMedia('(orientation: landscape)');
    this.landscapeQuery.addEventListener('change', this.onLandscapeChange);
    this.setState({ isLandscape: this.landscapeQuery.matches });
    this.gamepadAnimFrame = requestAnimationFrame(this.pollGamepad);
    this.onSslMessage = (evt) => {
      if (evt.data?.type === 'ssl_cert_accepted') {
        this.setState({ showSslTrust: false });
        this.handleConnect();
      }
    };
    window.addEventListener('message', this.onSslMessage);
    this.onBeforeUnload = () => this.connection.disconnect();
    window.addEventListener('beforeunload', this.onBeforeUnload);
    if (this.videoRef.current) {
      this.videoRef.current.addEventListener('resize', this.onVideoResize);
    }
    this.handleConnect();
  }

  componentDidUpdate(_prevProps, prevState) {
    if (prevState.connectionState !== this.state.connectionState) {
      if (this.state.connectionState === 'connected') {
        this.startStatsPolling();
      } else {
        this.stopStatsPolling();
      }
    }
    // Redraw latency graph when history changes
    if (prevState.latencyHistory !== this.state.latencyHistory && this.state.showStats) {
      this.drawLatencyGraph();
    }
    // Re-attach video streams when orientation changes (new DOM elements)
    if (prevState.isLandscape !== this.state.isLandscape) {
      if (this.videoRef.current) {
        this.videoRef.current.srcObject = this.streams.camera || null;
      }
      if (this.audioRef.current && this.audioRef.current.srcObject) {
        // Re-attach audio stream after orientation-triggered DOM swap
        const src = this.audioRef.current.srcObject;
        this.audioRef.current.srcObject = src;
      }
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    if (this.landscapeQuery) {
      this.landscapeQuery.removeEventListener('change', this.onLandscapeChange);
    }
    if (this.gamepadAnimFrame) {
      cancelAnimationFrame(this.gamepadAnimFrame);
    }
    if (this.videoRef.current) {
      this.videoRef.current.removeEventListener('resize', this.onVideoResize);
    }
    window.removeEventListener('message', this.onSslMessage);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this._micLevelFrame) cancelAnimationFrame(this._micLevelFrame);
    if (this._micAudioCtx) { this._micAudioCtx.close(); this._micAudioCtx = null; }
    if (this._remoteAudioFrame) cancelAnimationFrame(this._remoteAudioFrame);
    if (this._remoteAudioCtx) { this._remoteAudioCtx.close(); this._remoteAudioCtx = null; }
    this.stopStatsPolling();
    this.connection.disconnect();
  }

  startStatsPolling() {
    this.stopStatsPolling();
    this.prevStatsTimestamp = null;
    this.prevBytesReceived = null;
    this.prevFramesDecoded = null;
    this.statsInterval = setInterval(() => this.pollStats(), 1000);
    this.pollStats();
  }

  stopStatsPolling() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.setState({ stats: null, latency: null, latencyHistory: [] });
  }

  async pollStats() {
    const pc = this.connection.pc;
    if (!pc) return;

    try {
      const report = await pc.getStats();
      let videoStats = null;
      let candidatePairStats = null;

      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          videoStats = stat;
        }
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          candidatePairStats = stat;
        }
      });

      if (!videoStats) return;

      const now = videoStats.timestamp;
      let bitrate = 0;
      let fps = 0;

      if (this.prevStatsTimestamp !== null) {
        const elapsed = (now - this.prevStatsTimestamp) / 1000;
        if (elapsed > 0) {
          const bytesDelta = videoStats.bytesReceived - this.prevBytesReceived;
          bitrate = (bytesDelta * 8) / elapsed;
          const framesDelta = videoStats.framesDecoded - this.prevFramesDecoded;
          fps = framesDelta / elapsed;
        }
      }

      this.prevStatsTimestamp = now;
      this.prevBytesReceived = videoStats.bytesReceived;
      this.prevFramesDecoded = videoStats.framesDecoded;

      const stats = {
        resolution: `${videoStats.frameWidth || '?'}x${videoStats.frameHeight || '?'}`,
        fps: fps.toFixed(1),
        bitrate: bitrate > 1000000
          ? `${(bitrate / 1000000).toFixed(2)} Mbps`
          : `${(bitrate / 1000).toFixed(0)} kbps`,
        codec: videoStats.decoderImplementation || '?',
        framesDecoded: videoStats.framesDecoded || 0,
        framesDropped: videoStats.framesDropped || 0,
        packetsLost: videoStats.packetsLost || 0,
        packetsReceived: videoStats.packetsReceived || 0,
        jitter: videoStats.jitter !== undefined ? `${(videoStats.jitter * 1000).toFixed(1)} ms` : '?',
        rtt: candidatePairStats?.currentRoundTripTime !== undefined
          ? `${(candidatePairStats.currentRoundTripTime * 1000).toFixed(0)} ms`
          : '?',
        nackCount: videoStats.nackCount || 0,
        pliCount: videoStats.pliCount || 0,
        firCount: videoStats.firCount || 0,
      };

      this.setState({ stats });
    } catch {
      /* peer connection may have closed */
    }
  }

  onLandscapeChange(e) {
    this.setState({ isLandscape: e.matches });
  }

  onVideoResize() {
    const video = this.videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      const newRatio = `${video.videoWidth}/${video.videoHeight}`;
      if (newRatio !== this.state.videoAspectRatio) {
        this.setState({ videoAspectRatio: newRatio });
      }
    }
  }

  onKeyDown(e) {
    const arrowMap = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
    const k = arrowMap[e.key] || e.key.toLowerCase();
    if ('wasd'.includes(k) && k.length === 1) {
      e.preventDefault();
      this.setKey(k, true);
    }
    const cameraKeys = { 1: 'wideRoad', 2: 'driver' };
    if (cameraKeys[e.key]) {
      e.preventDefault();
      this.switchCamera(cameraKeys[e.key]);
    }
  }

  onKeyUp(e) {
    const arrowMap = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
    const k = arrowMap[e.key] || e.key.toLowerCase();
    if ('wasd'.includes(k) && k.length === 1) {
      e.preventDefault();
      this.setKey(k, false);
    }
  }

  isRearCamera() {
    return this.state.activeCamera === 'wideRoad';
  }

  setFlippedJoystick(x, y) {
    const flip = this.isRearCamera() ? 1 : -1;
    this.connection.setJoystick(flip * x, -y);
  }

  setKey(key, pressed) {
    this.setState((prev) => {
      const keys = { ...prev.keys, [key]: pressed };
      const x = -(keys.d ? 1 : 0) + (keys.a ? 1 : 0);
      const y = -(keys.w ? 1 : 0) + (keys.s ? 1 : 0);
      this.setFlippedJoystick(y, x);
      const anyKey = keys.w || keys.a || keys.s || keys.d;
      return { keys, thumbPos: anyKey ? { x: -x, y } : null };
    });
  }

  applyJoystick(clientX, clientY) {
    const area = this.joystickAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    let dx = (clientX - rect.left - halfW) / halfW;
    let dy = (clientY - rect.top - halfH) / halfH;
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    this.setState({ thumbPos: { x: dx, y: dy } });
    // Power curve (exponent 2) for finer control near center
    const expo = 2;
    const cx = Math.sign(dx) * Math.pow(Math.abs(dx), expo);
    const cy = Math.sign(dy) * Math.pow(Math.abs(dy), expo);
    this.setFlippedJoystick(cy, -cx);
  }

  resetJoystick() {
    this.setState({ thumbPos: null });
    this.connection.setJoystick(0, 0);
  }

  handleTouchStart(e) {
    e.preventDefault();
    if (this.touchId !== null) return;
    const t = e.changedTouches[0];
    this.touchId = t.identifier;
    this.applyJoystick(t.clientX, t.clientY);
  }

  handleTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touchId) this.applyJoystick(t.clientX, t.clientY);
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchId) {
        this.touchId = null;
        this.resetJoystick();
      }
    }
  }

  handleMouseDown(e) {
    e.preventDefault();
    this.mouseDragging = true;
    this.applyJoystick(e.clientX, e.clientY);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  handleMouseMove(e) {
    if (this.mouseDragging) this.applyJoystick(e.clientX, e.clientY);
  }

  handleMouseUp() {
    this.mouseDragging = false;
    this.resetJoystick();
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  async handleConnect() {
    const { dongleId, directAddress } = this.props;
    this.setState({ error: null, showSslTrust: false });
    try {
      if (directAddress) {
        await this.connection.connectDirect(directAddress);
      } else {
        await this.connection.connect(dongleId);
      }
    } catch (err) {
      this.setState({ error: err.message });
    }
  }

  handleDisconnect() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this._micLevelFrame) cancelAnimationFrame(this._micLevelFrame);
    if (this._micAudioCtx) { this._micAudioCtx.close(); this._micAudioCtx = null; }
    if (this._remoteAudioFrame) cancelAnimationFrame(this._remoteAudioFrame);
    if (this._remoteAudioCtx) { this._remoteAudioCtx.close(); this._remoteAudioCtx = null; }
    this.setState({ error: null, micMuted: true, micLevel: 0, remoteAudioLevel: 0 });
    this.connection.disconnect();
  }

  handlePlaySound(sound) {
    this.connection.playSound(sound).catch((err) => {
      console.error('Failed to play body sound:', err);
      this.setState({ error: err.message });
    });
  }

  toggleStreamMuted() {
    this.setState((prev) => ({ streamMuted: !prev.streamMuted }));
  }

  async handleMicToggle() {
    const { micMuted, micPermission } = this.state;

    // If mic is active, just mute the track
    if (!micMuted && this.micStream) {
      this.micStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      this.setState({ micMuted: true });
      return;
    }

    // If we already have a mic stream, unmute it
    if (micMuted && this.micStream) {
      this.micStream.getAudioTracks().forEach((t) => { t.enabled = true; });
      this.setState({ micMuted: false });
      return;
    }

    // First time: request mic permission and add track to connection
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      this.connection.addMicTrack(stream.getAudioTracks()[0]);
      this._monitorMicLevel(stream);
      this.setState({ micMuted: false, micPermission: 'granted' });
    } catch (err) {
      console.error('Mic access failed:', err);
      const permission = err.name === 'NotAllowedError' ? 'denied' : micPermission;
      this.setState({ micPermission: permission, error: 'Microphone access denied' });
    }
  }

  _monitorMicLevel(stream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      this._micAudioCtx = ctx;

      const poll = () => {
        if (!this.micStream) {
          ctx.close();
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.setState({ micLevel: Math.min(1, rms * 3) });
        this._micLevelFrame = requestAnimationFrame(poll);
      };
      this._micLevelFrame = requestAnimationFrame(poll);
    } catch (_) { /* AudioContext not available */ }
  }

  _monitorRemoteAudio(stream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      this._remoteAudioCtx = ctx;

      const poll = () => {
        if (!this._remoteAudioCtx) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.setState({ remoteAudioLevel: Math.min(1, rms * 3) });
        this._remoteAudioFrame = requestAnimationFrame(poll);
      };
      this._remoteAudioFrame = requestAnimationFrame(poll);
    } catch (_) { /* AudioContext not available */ }
  }

  handleClose() {
    this.handleDisconnect();
    if (this.props.onClose) {
      this.props.onClose();
    }
  }

  pollGamepad() {
    this.gamepadAnimFrame = requestAnimationFrame(this.pollGamepad);
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

    if (!gp) {
      if (this.state.gamepadConnected) {
        this.setState({ gamepadConnected: false, gamepadSteering: 0, gamepadGas: 0, gamepadBrake: 0 });
      }
      return;
    }

    if (!this.state.gamepadConnected) {
      this.setState({ gamepadConnected: true });
    }

    // Left stick: axes[0] = left/right turning only
    // Triggers: RT (button 7) = gas/forward, LT (button 6) = brake/backward
    const DEADZONE = 0.15;
    let lx = gp.axes[0] || 0;
    if (Math.abs(lx) < DEADZONE) lx = 0;

    // On some Linux drivers, triggers are analog on axes instead of buttons
    // axes layout: [lx, ly, lt_axis, rx, ry, rt_axis] (varies by driver)
    // Triggers may report 0 instead of -1 at rest until first pressed; use -1 as default
    const rawRt = gp.axes[5] !== undefined ? gp.axes[5] : undefined;
    const rawLt = gp.axes[4] !== undefined ? gp.axes[4] : undefined;
    if (rawRt !== undefined && rawRt !== 0) this.rtActivated = true;
    if (rawLt !== undefined && rawLt !== 0) this.ltActivated = true;
    const rt = rawRt !== undefined ? ((this.rtActivated ? rawRt : -1) + 1) / 2
      : gp.buttons[7] ? gp.buttons[7].value : 0;
    const lt = rawLt !== undefined ? ((this.ltActivated ? rawLt : -1) + 1) / 2
      : gp.buttons[6] ? gp.buttons[6].value : 0;

    const throttle = lt - rt; // negative = forward (gas), positive = backward (brake)

    // Bumpers: LB = button 4 (road camera), RB = button 5 (driver camera)
    const lb = gp.buttons[4] && gp.buttons[4].pressed;
    const rb = gp.buttons[5] && gp.buttons[5].pressed;

    this.setState({ gamepadSteering: lx, gamepadGas: rt, gamepadBrake: lt, gamepadLB: !!lb, gamepadRB: !!rb });

    if (this.state.connectionState === 'connected') {
      this.setFlippedJoystick(throttle, -lx);
      if (lx !== 0 || rt > 0 || lt > 0) {
        this.setState({ thumbPos: { x: lx, y: throttle } });
      } else if (this.state.thumbPos && !this.mouseDragging && this.touchId === null) {
        this.setState({ thumbPos: null });
      }
    }

    if (lb && !this.prevBumpers.lb) {
      this.switchCamera('driver');
    }
    if (rb && !this.prevBumpers.rb) {
      this.switchCamera('wideRoad');
    }

    this.prevBumpers = { lb, rb };
  }

  handleScreenshot() {
    const video = this.videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `screenshot_${this.state.activeCamera}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  switchCamera(cameraName) {
    if (cameraName === this.state.activeCamera) return;
    this.setState({ activeCamera: cameraName });
    if (this._switchCameraTimer) clearTimeout(this._switchCameraTimer);
    this._switchCameraTimer = setTimeout(() => {
      this._switchCameraTimer = null;
      this.connection.switchCamera(cameraName);
    }, 200);
  }

  getStatusDotColor() {
    const { connectionState } = this.state;
    let color;
    switch (connectionState) {
      case 'connecting': color = '#facc15'; break;
      case 'connected': color = Colors.green50; break;
      case 'failed': color = Colors.red50; break;
      default: color = Colors.grey400;
    }
    return color;
  }

  renderPortraitStatusBar() {
    const { classes } = this.props;
    const { connectionState, batteryLevel, streamMuted, micMuted, micPermission } = this.state;
    const micTitle = micPermission === 'denied'
      ? 'Microphone permission blocked'
      : (micMuted ? (micPermission === 'granted' ? 'Unmute mic' : 'Enable mic') : 'Mute mic');

    return (
      <div className={`${classes.controlsGroup} ${classes.controlsGroupPortrait}`}>
        <div className={classes.portraitRow}>
          <div className={classes.hudPill}>
            <div
              className={classes.statusDot}
              style={{
                backgroundColor: this.getStatusDotColor(),
                animation: connectionState === 'connecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span className={classes.hudText}>{connectionState}</span>
          </div>
          {batteryLevel !== null && (
            <div className={classes.hudPill}>
              <BatteryFull style={{ fontSize: 14, color: Colors.white70 }} />
              <span className={classes.hudText}>{batteryLevel}%</span>
            </div>
          )}
          <div
            className={classes.statsToggleButton}
            onClick={() => {
              this.setState((prev) => {
                const next = !prev.showStats;
                this.connection.setTimingSei(next);
                return { showStats: next };
              });
            }}
            title="Toggle stats"
          >
            STATS
          </div>
          <div style={{ flex: 1 }} />
          <div className={classes.controlsButtons}>
            <div
              className={`${classes.actionButton} ${classes.actionButtonPortrait} ${streamMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.toggleStreamMuted}
              title={streamMuted ? 'Unmute stream audio' : 'Mute stream audio'}
            >
              {streamMuted ? <VolumeOff className={classes.actionButtonIconPortrait} /> : <VolumeUp className={classes.actionButtonIconPortrait} />}
            </div>
            <div
              className={`${classes.actionButton} ${classes.actionButtonPortrait} ${micMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.handleMicToggle}
              title={micTitle}
              style={{ display: 'none', pointerEvents: 'none', opacity: 0.5 }}
              disabled
            >
              {micMuted ? <MicOff className={classes.actionButtonIconPortrait} /> : <Mic className={classes.actionButtonIconPortrait} />}
            </div>
            <div
              className={`${classes.actionButton} ${classes.actionButtonPortrait}`}
              onClick={() => this.handleScreenshot()}
              title="Save screenshot"
            >
              <PhotoCamera className={classes.actionButtonIconPortrait} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderHud() {
    const { classes } = this.props;
    const { connectionState, batteryLevel } = this.state;

    return (
      <div className={classes.hudTopRight}>
        <div
          className={classes.hudPillButton}
          onClick={() => {
                this.setState((prev) => {
                  const next = !prev.showStats;
                  this.connection.setTimingSei(next);
                  return { showStats: next };
                });
              }}
          title="Toggle stats"
        >
          <span className={classes.hudText}>stats</span>
        </div>
        <div className={classes.hudPill}>
          <div
            className={classes.statusDot}
            style={{
              backgroundColor: this.getStatusDotColor(),
            }}
          />
          <span className={classes.hudText}>{connectionState}</span>
        </div>
        {batteryLevel !== null && (
          <div className={classes.hudPill}>
            <BatteryFull style={{ fontSize: 16, color: Colors.white70 }} />
            <span className={classes.hudText}>{batteryLevel}%</span>
          </div>
        )}
      </div>
    );
  }

  renderControls(portrait) {
    const { classes } = this.props;
    const { activeCamera, gamepadConnected, streamMuted, micMuted, micPermission } = this.state;
    const micTitle = micPermission === 'denied'
      ? 'Microphone permission blocked'
      : (micMuted ? (micPermission === 'granted' ? 'Unmute mic' : 'Enable mic') : 'Mute mic');

    if (portrait) {
      return (
        <div className={`${classes.controlsGroup} ${classes.controlsGroupPortrait}`}>
          <div className={classes.portraitRow}>
            {!gamepadConnected && (
              <div className={classes.portraitCategory}>
                <span className={classes.controlsLabelPortrait}>Cams</span>
                <div className={classes.controlsButtons}>
                  {CAMERAS.map((cam) => (
                    <div
                      key={cam.key}
                      className={`${classes.controlButton} ${classes.controlButtonPortrait} ${activeCamera === cam.key ? classes.controlButtonActive : classes.controlButtonInactive}`}
                      style={{aspectRatio:"1/1"}}
                      onClick={() => this.switchCamera(cam.key)}
                    >
                      {cam.num}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div className={classes.portraitCategory}>
              <span className={classes.controlsLabelPortrait}>Play Sounds</span>
              <div className={classes.controlsButtons}>
                {QUICK_SOUNDS.map((sound) => (
                  <div
                    key={sound.key}
                    className={`${classes.controlButton} ${classes.controlButtonPortrait}`}
                    onClick={() => this.handlePlaySound(sound.key)}
                  >
                    {sound.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Landscape: side-by-side columns with labels below
    return (
      <div className={classes.controlsGroup}>
        {!gamepadConnected && (
          <div className={classes.controlsColumn}>
            <div className={classes.controlsButtons}>
              {CAMERAS.map((cam) => (
                <div
                  key={cam.key}
                  className={`${classes.controlButton} ${activeCamera === cam.key ? classes.controlButtonActive : classes.controlButtonInactive}`}
                  onClick={() => this.switchCamera(cam.key)}
                >
                  {cam.label}
                </div>
              ))}
            </div>
            <span className={classes.controlsLabelBelow}>Camera</span>
          </div>
        )}
        <div className={classes.controlsColumn}>
          <div className={classes.controlsButtons}>
            {QUICK_SOUNDS.map((sound) => (
              <div
                key={sound.key}
                className={classes.controlButton}
                onClick={() => this.handlePlaySound(sound.key)}
              >
                {sound.label}
              </div>
            ))}
          </div>
          <span className={classes.controlsLabelBelow}>Sounds</span>
        </div>
        <div className={classes.controlsColumn}>
          <div className={classes.controlsButtons}>
            <div
              className={`${classes.controlButton} ${streamMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.toggleStreamMuted}
              title={streamMuted ? 'Unmute stream audio' : 'Mute stream audio'}
            >
              {streamMuted ? <VolumeOff className={classes.actionButtonIcon} /> : <VolumeUp className={classes.actionButtonIcon} />}
            </div>
            <div
              className={`${classes.controlButton} ${micMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.handleMicToggle}
              title={micTitle}
              style={{ display: 'none', pointerEvents: 'none', opacity: 0.5 }}
              disabled
            >
              {micMuted ? <MicOff className={classes.actionButtonIcon} /> : <Mic className={classes.actionButtonIcon} />}
            </div>
          </div>
          <span className={classes.controlsLabelBelow}>Sound</span>
        </div>
        <div className={classes.controlsColumn}>
          <div className={classes.controlsButtons}>
            <div
              className={classes.controlButton}
              onClick={() => this.handleScreenshot()}
              title="Save screenshot"
            >
              <PhotoCamera className={classes.actionButtonIcon} />
            </div>
          </div>
          <span className={classes.controlsLabelBelow}>Screenshot</span>
        </div>
      </div>
    );
  }

  renderJoystick(portrait) {
    const { classes } = this.props;
    const { thumbPos } = this.state;
    const thumbRange = portrait ? 45 : 40;
    const thumbLeft = thumbPos ? `${50 + thumbPos.x * thumbRange}%` : '50%';
    const thumbTop = thumbPos ? `${50 + thumbPos.y * thumbRange}%` : '50%';
    const joystickClassname = portrait ? classes.joystickAreaMobile : classes.joystickArea;

    return (
      <div
        ref={this.joystickAreaRef}
        className={`${joystickClassname} ${classes.joystickAreaSquare}`}
        onTouchStart={this.handleTouchStart}
        onTouchMove={this.handleTouchMove}
        onTouchEnd={this.handleTouchEnd}
        onTouchCancel={this.handleTouchEnd}
        onMouseDown={this.handleMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className={classes.joystickCrosshairV} />
        <div className={classes.joystickCrosshairH} />
        <div className={classes.joystickCenter} />
        <div
          className={`${classes.joystickThumb} ${thumbPos ? classes.joystickThumbActive : ''}`}
          style={{ left: thumbLeft, top: thumbTop }}
        />
      </div>
    );
  }

  renderControllerOverlay() {
    const { classes } = this.props;
    const { gamepadSteering, gamepadGas, gamepadBrake, gamepadLB, gamepadRB, activeCamera } = this.state;

    // Joystick thumb position: map steering (-1 to 1) to left percentage
    const thumbLeft = 50 + gamepadSteering * 34;

    return (
      <div className={classes.controllerOverlay}>
        <div className={classes.triggerContainer}>
          <span className={`${classes.bumperLabel} ${gamepadLB ? classes.bumperLabelActive : ''}`}>Driver Camera</span>
          <div
            className={`${classes.bumperShape} ${gamepadLB ? classes.bumperActive : ''}`}
            style={activeCamera === 'driver' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
          >
            <span className={`${classes.bumperLabel} ${gamepadLB ? classes.bumperLabelActive : ''}`}>L1</span>
          </div>
          <div className={classes.triggerShape}>
            <div
              className={classes.triggerFill}
              style={{
                height: `${gamepadBrake * 100}%`,
                background: 'rgba(239,68,68,0.45)',
              }}
            />
            <span className={classes.triggerInnerLabel}>LT</span>
          </div>
          <span className={classes.triggerLabel}>Backward</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className={classes.controllerJoystickLabel}>L Stick — Steering</span>
          <div className={classes.controllerJoystick}>
            <div className={classes.controllerJoystickTrack} />
            <span className={classes.controllerJoystickArrows} style={{ left: 6 }}>{'\u25C0'}</span>
            <span className={classes.controllerJoystickArrows} style={{ right: 6 }}>{'\u25B6'}</span>
            <div
              className={classes.controllerJoystickThumb}
              style={{ left: `calc(${thumbLeft}% - 16px)` }}
            />
          </div>
        </div>

        <div className={classes.triggerContainer}>
          <span className={`${classes.bumperLabel} ${gamepadRB ? classes.bumperLabelActive : ''}`}>Road Camera</span>
          <div
            className={`${classes.bumperShape} ${gamepadRB ? classes.bumperActive : ''}`}
            style={activeCamera === 'wideRoad' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
          >
            <span className={`${classes.bumperLabel} ${gamepadRB ? classes.bumperLabelActive : ''}`}>R1</span>
          </div>
          <div className={classes.triggerShape}>
            <div
              className={classes.triggerFill}
              style={{
                height: `${gamepadGas * 100}%`,
                background: 'rgba(34,197,94,0.45)',
              }}
            />
            <span className={classes.triggerInnerLabel}>RT</span>
          </div>
          <span className={classes.triggerLabel}>Forward</span>
        </div>
      </div>
    );
  }

  drawLatencyGraph() {
    const canvas = this.latencyCanvasRef.current;
    if (!canvas) return;
    const { latencyHistory } = this.state;
    if (!latencyHistory.length) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Determine y-axis scale from data
    const maxVal = Math.max(
      10,
      ...latencyHistory.map((l) => (l.totalMs != null ? l.totalMs : l.devicePipelineMs) || 0),
    );
    const yScale = (h - 2) / (maxVal * 1.15); // 15% headroom
    const xStep = w / Math.max(latencyHistory.length - 1, 1);

    // Stacked area layers: capture (bottom), encode, sendDelay, network (top)
    const layers = [
      { key: 'captureMs', color: 'rgba(76,175,80,0.55)' },
      { key: 'encodeMs', color: 'rgba(255,183,77,0.55)' },
      { key: 'sendDelayMs', color: 'rgba(171,71,188,0.45)' },
      { key: 'networkMs', color: 'rgba(66,165,245,0.55)' },
    ];

    // Build cumulative sums per sample
    const cums = latencyHistory.map((l) => {
      let sum = 0;
      return layers.map(({ key }) => {
        const v = l[key];
        sum += (v != null && v > 0) ? v : 0;
        return sum;
      });
    });

    // Draw each layer bottom-up (reverse so lower layers paint first)
    for (let li = layers.length - 1; li >= 0; li--) {
      ctx.beginPath();
      for (let i = 0; i < cums.length; i++) {
        const x = i * xStep;
        const y = h - cums[i][li] * yScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // Close along bottom
      ctx.lineTo((cums.length - 1) * xStep, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = layers[li].color;
      ctx.fill();
    }

    // Y-axis label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText(`${Math.round(maxVal)}ms`, 2, 9);
  }

  renderStatsOverlay(portrait = false) {
    const { classes } = this.props;
    const { showStats, stats, latency, micLevel, remoteAudioLevel, micMuted, streamMuted } = this.state;

    if (!showStats || !stats) return null;

    const micColor = micMuted ? 'rgba(255,255,255,0.15)' : `rgba(76,175,80,${0.5 + micLevel * 0.5})`;
    const audioColor = streamMuted ? 'rgba(255,255,255,0.15)' : `rgba(66,165,245,${0.5 + remoteAudioLevel * 0.5})`;

    const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');

    return (
      <div className={portrait ? classes.statsTogglePortrait : classes.statsToggle}>
        <div className={classes.statsPanel}>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Resolution</span>
              <span className={classes.statsValue}>{stats.resolution}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>FPS</span>
              <span className={classes.statsValue}>{stats.fps}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Bitrate</span>
              <span className={classes.statsValue}>{stats.bitrate}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>RTT</span>
              <span className={classes.statsValue}>{stats.rtt}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Jitter</span>
              <span className={classes.statsValue}>{stats.jitter}</span>
            </div>
            <div className={classes.statsDivider} />
            {latency && (
              <>
                <div className={classes.latencySectionHeader}>FRAME LATENCY</div>
                <div className={classes.statsRow}>
                  <span className={classes.statsLabel} style={{ color: 'rgba(76,175,80,0.7)' }}>Capture</span>
                  <span className={classes.statsValue}>{fmtMs(latency.captureMs)}</span>
                </div>
                <div className={classes.statsRow}>
                  <span className={classes.statsLabel} style={{ color: 'rgba(255,183,77,0.7)' }}>Encode</span>
                  <span className={classes.statsValue}>{fmtMs(latency.encodeMs)}</span>
                </div>
                <div className={classes.statsRow}>
                  <span className={classes.statsLabel} style={{ color: 'rgba(171,71,188,0.65)' }}>Send delay</span>
                  <span className={classes.statsValue}>{fmtMs(latency.sendDelayMs)}</span>
                </div>
                <div className={classes.statsRow}>
                  <span className={classes.statsLabel} style={{ color: 'rgba(66,165,245,0.7)' }}>Network</span>
                  <span className={classes.statsValue}>{fmtMs(latency.networkMs)}</span>
                </div>
                <div className={classes.statsRow}>
                  <span className={classes.statsLabel} style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Total</span>
                  <span className={classes.statsValue} style={{ fontWeight: 700 }}>{fmtMs(latency.totalMs)}</span>
                </div>
                <canvas
                  ref={this.latencyCanvasRef}
                  className={classes.latencyGraph}
                />
                <div className={classes.statsDivider} />
              </>
            )}
            <div className={classes.audioLevelRow} title={micMuted ? 'Mic muted' : 'Mic level'}>
              <span className={classes.audioLevelIcon}>
                {micMuted ? <MicOff style={{ fontSize: 12 }} /> : <Mic style={{ fontSize: 12 }} />}
              </span>
              <div className={classes.audioLevelTrack}>
                <div
                  className={classes.audioLevelFill}
                  style={{
                    width: `${(micMuted ? 0 : micLevel) * 100}%`,
                    background: micColor,
                  }}
                />
              </div>
            </div>
            <div className={classes.audioLevelRow} title={streamMuted ? 'Audio muted' : 'Remote audio level'}>
              <span className={classes.audioLevelIcon}>
                {streamMuted ? <VolumeOff style={{ fontSize: 12 }} /> : <VolumeUp style={{ fontSize: 12 }} />}
              </span>
              <div className={classes.audioLevelTrack}>
                <div
                  className={classes.audioLevelFill}
                  style={{
                    width: `${remoteAudioLevel * 100}%`,
                    background: audioColor,
                  }}
                />
              </div>
            </div>
          </div>
      </div>
    );
  }

  renderConnectOverlay() {
    const { classes } = this.props;
    const { connectionState, error, statusMessage, connectProgress } = this.state;
    const connecting = connectionState === 'connecting';
    const failed = connectionState === 'failed';

    return (
      <div className={classes.connectOverlay}>
        <div className={classes.connectContent}>
          {connecting ? (
            <>
              <div className={classes.progressBar}>
                <div className={classes.progressFill} style={{ width: `${connectProgress || 0}%` }} />
              </div>
              <span className={classes.progressLabel}>{statusMessage || 'Connecting...'}</span>
            </>
          ) : failed ? (
            <Button
              className={`${classes.connectButton} ${classes.connectButtonFailed}`}
              onClick={this.handleConnect}
              disableRipple
            >
              <Refresh style={{ fontSize: 20 }} />
              Retry
            </Button>
          ) : null}
          {error && <div className={classes.errorBanner}>{error}</div>}
          {!connecting && (
            <div className={classes.infoBanner}>
              <InfoOutline style={{ fontSize: 16 }} />
              <span>Body must be powered on and started.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  renderLandscape() {
    const { classes, device } = this.props;
    const { connectionState } = this.state;
    const connected = connectionState === 'connected';

    return (
      <div className={classes.root}>
        <div className={classes.videoContainer}>
          <video ref={this.videoRef} autoPlay playsInline muted className={classes.video} />
          <audio ref={this.audioRef} autoPlay muted={this.state.streamMuted} />

          {/* Back button + device name */}
          <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconButton className={classes.backButton} onClick={this.handleClose} style={{ width: 32, height: 32, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              <ArrowBackBold style={{ fontSize: 18 }} />
            </IconButton>
            <div style={{ borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 500, color: Colors.white, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              {this.props.directAddress || (device ? deviceNamePretty(device) : 'Body')}
            </div>
          </div>

          { connected ? (
            <>
              {this.renderHud()}
              {this.renderStatsOverlay()}
              {this.state.gamepadConnected
                ? this.renderControllerOverlay()
                : this.renderJoystick()}
              {this.renderControls(false)}
            </>
          ) : (
            this.renderConnectOverlay()
          )}
        </div>
      </div>
    );
  }

  renderPortrait() {
    const { classes, device } = this.props;
    const { connectionState, batteryLevel, error } = this.state;
    const connected = connectionState === 'connected';
    const connecting = connectionState === 'connecting';

    return (
      <div className={classes.root}>
        <div className={classes.header}>
          <IconButton className={classes.backButton} onClick={this.handleClose}>
            <ArrowBackBold style={{ fontSize: 20 }} />
          </IconButton>
          <Typography className={classes.headerTitle}>
            {this.props.directAddress || (device ? deviceNamePretty(device) : 'Body Teleop')}
          </Typography>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {connected && this.renderPortraitStatusBar()}
          <div style={{ position: 'relative', background: Colors.black, flexShrink: 0 }}>
            <video
              ref={this.videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', aspectRatio: this.state.videoAspectRatio, display: 'block' }}
            />
            <audio ref={this.audioRef} autoPlay muted={this.state.streamMuted} />
            {connected && this.renderStatsOverlay(true)}
          </div>
          {connected ?
            <>
              {this.renderControls(true)}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0, overflow: 'hidden' }}>
                {this.renderJoystick(true)}
              </div>
            </>
          :
            <div className={classes.portraitContent} style={{ overflow: 'auto' }}>
              <div className={classes.statusRow}>
                <div className={classes.statusLeft}>
                  <div className={classes.statusDot} style={{ backgroundColor: this.getStatusDotColor(), width: 10, height: 10 }} />
                  <Typography style={{ fontSize: 14, textTransform: 'capitalize' }}>{connectionState}</Typography>
                </div>
                {batteryLevel !== null && (
                  <div className={classes.batteryPill}>
                    <BatteryFull style={{ fontSize: 18, color: Colors.white70 }} />
                    <Typography style={{ fontSize: 14 }}>{batteryLevel}%</Typography>
                  </div>
                )}
              </div>
              {error && (
                <div style={{ borderRadius: 8, background: 'rgba(220,38,38,0.15)', padding: 12, fontSize: 14, color: '#fca5a5' }}>
                  {error}
                </div>
              )}
              {connecting ? (
                <>
                  <div className={classes.progressBar} style={{ width: '100%' }}>
                    <div className={classes.progressFill} style={{ width: `${this.state.connectProgress || 0}%` }} />
                  </div>
                  <Typography style={{ fontSize: 12, color: Colors.white50, textAlign: 'center' }}>
                    {this.state.statusMessage || 'Connecting...'}
                  </Typography>
                </>
              ) : connectionState === 'failed' ? (
                <Button
                  variant="contained"
                  className={classes.portraitButton}
                  style={{ background: Colors.red400, color: Colors.white }}
                  onClick={this.handleConnect}
                >
                  Retry
                </Button>
              ) : null}
              <div className={classes.infoBox}>
                <div className={classes.infoRow}>
                  <InfoOutline style={{ fontSize: 18 }} />
                  <span>The comma body must be powered on and ignition must be started to connect.</span>
                </div>
              </div>
            </div>
          }
          {connected && (
            <div style={{ flexShrink: 0, padding: '8px 16px 16px' }}>
              <Button
                variant="contained"
                className={classes.portraitButton}
                style={{ background: Colors.red400, color: Colors.white, width: '100%' }}
                onClick={this.handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  render() {
    const { isLandscape } = this.state;
    return isLandscape ? this.renderLandscape() : this.renderPortrait();
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(BodyTeleop));
