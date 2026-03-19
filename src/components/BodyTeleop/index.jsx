import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Typography, Button, IconButton } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import InfoOutline from '@material-ui/icons/InfoOutline';
import ScreenRotation from '@material-ui/icons/ScreenRotation';
import BatteryFull from '@material-ui/icons/BatteryFull';
import PhotoCamera from '@material-ui/icons/PhotoCamera';

import Colors from '../../colors';
import { deviceNamePretty } from '../../utils';
import { isMobile } from '../../utils/browser';
import { BodyTeleopConnection } from '../../utils/bodyteleop';
import { ArrowBackBold } from '../../icons';

const styles = () => ({
  root: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1300,
    background: Colors.grey999,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: Colors.grey950,
    borderBottom: `1px solid ${Colors.white10}`,
    minHeight: 48,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 500,
    marginLeft: 8,
    flex: 1,
  },
  backButton: {
    color: Colors.white,
    padding: 8,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: Colors.black,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  hudTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  hudPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '4px 12px',
    borderRadius: 20,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${Colors.white10}`,
  },
  hudText: {
    fontSize: 12,
    color: Colors.white70,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  connectOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  connectButton: {
    padding: '10px 24px',
    borderRadius: 24,
    color: Colors.white,
    fontSize: 14,
    fontWeight: 500,
    background: 'rgba(255,255,255,0.15)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    border: `1px solid ${Colors.white20}`,
    backdropFilter: 'blur(12px)',
    cursor: 'pointer',
    textTransform: 'none',
    '& span': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    '&:hover': {
      background: 'rgba(255,255,255,0.25)',
    },
  },
  connectButtonFailed: {
    background: 'rgba(220,38,38,0.6)',
    '&:hover': {
      background: 'rgba(220,38,38,0.7)',
    },
  },
  connectButtonConnecting: {
    animation: '$pulse 1.5s ease-in-out infinite',
  },
  progressBar: {
    width: 240,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    background: 'rgba(255,255,255,0.7)',
    transition: 'width 0.4s ease',
  },
  progressLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  errorBanner: {
    maxWidth: 280,
    borderRadius: 8,
    padding: '6px 12px',
    textAlign: 'center',
    fontSize: 12,
    color: '#fca5a5',
    background: 'rgba(220,38,38,0.4)',
    backdropFilter: 'blur(8px)',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderRadius: 20,
    padding: '6px 12px',
    fontSize: 12,
    color: Colors.white50,
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(8px)',
  },
  // Joystick
  joystickArea: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
    width: 128,
    height: 128,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
    boxShadow: 'inset 0 0 20px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)',
    border: '1.5px solid rgba(255,255,255,0.2)',
    backdropFilter: 'blur(12px)',
    touchAction: 'none',
    '@media (min-width: 768px)': {
      width: 144,
      height: 144,
    },
  },
  joystickCrosshairV: {
    position: 'absolute',
    left: '50%',
    top: 8,
    bottom: 8,
    width: 1,
    transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.1)',
  },
  joystickCrosshairH: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 1,
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.1)',
  },
  joystickCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 6,
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
  },
  joystickThumb: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    transition: 'left 16ms, top 16ms',
    background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
    boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.25)',
    '@media (min-width: 768px)': {
      width: 56,
      height: 56,
    },
  },
  joystickThumbActive: {
    background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.6), rgba(255,255,255,0.15))',
    boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.4), 0 2px 12px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.35)',
  },
  // WASD keys
  wasdContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    borderRadius: 12,
    padding: 8,
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(8px)',
  },
  wasdRow: {
    display: 'flex',
    gap: '2px',
  },
  wasdKey: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.15s, color 0.15s',
  },
  wasdKeyInactive: {
    background: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
  },
  wasdKeyActive: {
    background: 'rgba(255,255,255,0.3)',
    color: Colors.white,
  },
  // Camera switcher
  cameraSwitcher: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    display: 'flex',
    gap: '2px',
    borderRadius: 12,
    padding: 4,
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(8px)',
  },
  cameraSwitcherPortrait: {
    position: 'relative',
    bottom: 'auto',
    left: 'auto',
    transform: 'none',
    alignSelf: 'center',
    marginTop: 8,
  },
  cameraButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.15s, color 0.15s',
  },
  cameraButtonInactive: {
    background: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
  },
  cameraButtonActive: {
    background: 'rgba(255,255,255,0.3)',
    color: Colors.white,
  },
  cameraButtonKey: {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.15)',
  },
  // Portrait mode
  portraitContent: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    background: Colors.grey900,
    padding: 12,
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  batteryPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: 14,
  },
  portraitButton: {
    borderRadius: 24,
    padding: '10px 20px',
    textTransform: 'none',
    fontWeight: 500,
  },
  infoBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderRadius: 8,
    background: Colors.grey900,
    padding: 12,
    fontSize: 12,
    color: Colors.white50,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statsToggle: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statsToggleButton: {
    padding: '2px 10px',
    borderRadius: '10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.6)',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': {
      color: 'rgba(255,255,255,0.9)',
      background: 'rgba(0,0,0,0.6)',
    },
  },
  statsPanel: {
    marginTop: 4,
    padding: '6px 10px',
    borderRadius: 8,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    minWidth: 160,
    fontFamily: 'monospace',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
  },
  statsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginRight: 12,
  },
  statsValue: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
  },
  statsDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.08)',
    margin: '3px 0',
  },
  screenshotButton: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    border: `1px solid ${Colors.white10}`,
    color: Colors.white70,
    cursor: 'pointer',
    '&:hover': {
      background: 'rgba(0,0,0,0.7)',
      color: Colors.white,
    },
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
});

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
      showStats: true,
      stats: null,
      activeCamera: 'driver',
    };

    this.videoRef = React.createRef();
    this.audioRef = React.createRef();
    this.joystickAreaRef = React.createRef();
    this.touchId = null;
    this.mouseDragging = false;
    this.streams = {};

    this.connection = new BodyTeleopConnection({
      onConnectionState: (connectionState) => this.setState({
        connectionState,
        ...(connectionState !== 'connecting' ? { statusMessage: null, connectProgress: 0 } : {}),
      }),
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
      onVideoTrack: (cameraName, stream) => {
        this.streams[cameraName] = stream;
        if (cameraName === this.state.activeCamera && this.videoRef.current) {
          this.videoRef.current.srcObject = stream;
        }
      },
      onAudioTrack: (stream) => {
        if (this.audioRef.current) this.audioRef.current.srcObject = stream;
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
    this.setState({ stats: null });
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

  onKeyDown(e) {
    const k = e.key.toLowerCase();
    if ('wasd'.includes(k) && k.length === 1) {
      e.preventDefault();
      this.setKey(k, true);
    }
    const cameraKeys = { 1: 'driver', 2: 'wideRoad' };
    if (cameraKeys[e.key]) {
      e.preventDefault();
      this.switchCamera(cameraKeys[e.key]);
    }
  }

  onKeyUp(e) {
    const k = e.key.toLowerCase();
    if ('wasd'.includes(k) && k.length === 1) {
      e.preventDefault();
      this.setKey(k, false);
    }
  }

  setKey(key, pressed) {
    this.setState((prev) => {
      const keys = { ...prev.keys, [key]: pressed };
      this.connection.setJoystick(
        -(keys.w ? 1 : 0) + (keys.s ? 1 : 0),
        -(keys.d ? 1 : 0) + (keys.a ? 1 : 0),
      );
      return { keys };
    });
  }

  applyJoystick(clientX, clientY) {
    const area = this.joystickAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (clientX - rect.left - radius) / radius;
    let dy = (clientY - rect.top - rect.height / 2) / radius;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    this.setState({ thumbPos: { x: dx, y: dy } });
    this.connection.setJoystick(dy, -dx);
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
    this.setState({ error: null });
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
    this.setState({ error: null });
    this.connection.disconnect();
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
    if (!gp) return;

    // Left stick: axes[0] = left/right turning only
    // Triggers: RT (button 7) = gas/forward, LT (button 6) = brake/backward
    const DEADZONE = 0.15;
    let lx = gp.axes[0] || 0;
    if (Math.abs(lx) < DEADZONE) lx = 0;

    const rt = (gp.buttons[7] && gp.buttons[7].value) || 0;
    const lt = (gp.buttons[6] && gp.buttons[6].value) || 0;
    const throttle = lt - rt; // negative = forward (gas), positive = backward (brake)

    if (this.state.connectionState === 'connected') {
      this.connection.setJoystick(throttle, -lx);
      if (lx !== 0 || rt > 0 || lt > 0) {
        this.setState({ thumbPos: { x: lx, y: throttle } });
      } else if (this.state.thumbPos && !this.mouseDragging && this.touchId === null) {
        this.setState({ thumbPos: null });
      }
    }

    // Bumpers: LB = button 4, RB = button 5
    const cameras = ['driver', 'wideRoad'];
    const lb = gp.buttons[4] && gp.buttons[4].pressed;
    const rb = gp.buttons[5] && gp.buttons[5].pressed;

    if (lb && !this.prevBumpers.lb) {
      const idx = cameras.indexOf(this.state.activeCamera);
      this.switchCamera(cameras[(idx - 1 + cameras.length) % cameras.length]);
    }
    if (rb && !this.prevBumpers.rb) {
      const idx = cameras.indexOf(this.state.activeCamera);
      this.switchCamera(cameras[(idx + 1) % cameras.length]);
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
    this.setState({ activeCamera: cameraName });
    if (this.videoRef.current) {
      this.videoRef.current.srcObject = this.streams[cameraName] || null;
    }
  }

  isMobile() {
    return isMobile();
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

  renderHud() {
    const { classes } = this.props;
    const { connectionState, batteryLevel } = this.state;

    return (
      <div className={classes.hudTopRight}>
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
            <BatteryFull style={{ fontSize: 16, color: Colors.white70 }} />
            <span className={classes.hudText}>{batteryLevel}%</span>
          </div>
        )}
        <div
          className={classes.screenshotButton}
          onClick={() => this.handleScreenshot()}
          title="Save screenshot"
        >
          <PhotoCamera style={{ fontSize: 18 }} />
        </div>
      </div>
    );
  }

  renderJoystick() {
    const { classes } = this.props;
    const { thumbPos } = this.state;
    const thumbLeft = thumbPos ? `${50 + thumbPos.x * 35}%` : '50%';
    const thumbTop = thumbPos ? `${50 + thumbPos.y * 35}%` : '50%';

    return (
      <div
        ref={this.joystickAreaRef}
        className={classes.joystickArea}
        onTouchStart={this.handleTouchStart}
        onTouchMove={this.handleTouchMove}
        onTouchEnd={this.handleTouchEnd}
        onTouchCancel={this.handleTouchEnd}
        onMouseDown={this.handleMouseDown}
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

  renderWasdKeys() {
    const { classes } = this.props;
    const { keys } = this.state;

    const WasdKey = ({ label, active, keyName }) => (
      <div
        className={`${classes.wasdKey} ${active ? classes.wasdKeyActive : classes.wasdKeyInactive}`}
        onMouseDown={() => this.setKey(keyName, true)}
        onMouseUp={() => this.setKey(keyName, false)}
        onMouseLeave={() => active && this.setKey(keyName, false)}
      >
        {label}
      </div>
    );

    return (
      <div className={classes.wasdContainer}>
        <WasdKey label="W" active={keys.w} keyName="w" />
        <div className={classes.wasdRow}>
          <WasdKey label="A" active={keys.a} keyName="a" />
          <WasdKey label="S" active={keys.s} keyName="s" />
          <WasdKey label="D" active={keys.d} keyName="d" />
        </div>
      </div>
    );
  }

  renderCameraSwitcher(portrait) {
    const { classes } = this.props;
    const { activeCamera } = this.state;
    const cameras = [
      { key: 'driver', label: 'front', num: '1' },
      { key: 'wideRoad', label: 'rear', num: '2' },
    ];

    return (
      <div className={`${classes.cameraSwitcher} ${portrait ? classes.cameraSwitcherPortrait : ''}`}>
        {cameras.map((cam) => (
          <div
            key={cam.key}
            className={`${classes.cameraButton} ${activeCamera === cam.key ? classes.cameraButtonActive : classes.cameraButtonInactive}`}
            onClick={() => this.switchCamera(cam.key)}
          >
            <span className={classes.cameraButtonKey}>{cam.num}</span>
            {cam.label}
          </div>
        ))}
      </div>
    );
  }

  renderStatsOverlay() {
    const { classes } = this.props;
    const { showStats, stats } = this.state;

    return (
      <div className={classes.statsToggle}>
        <div
          className={classes.statsToggleButton}
          onClick={() => this.setState((prev) => ({ showStats: !prev.showStats }))}
        >
          {showStats ? 'STATS' : 'STATS'}
        </div>
        {showStats && stats && (
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
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Decoded</span>
              <span className={classes.statsValue}>{stats.framesDecoded}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Dropped</span>
              <span className={classes.statsValue}>{stats.framesDropped}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Packets</span>
              <span className={classes.statsValue}>{stats.packetsReceived}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Lost</span>
              <span className={classes.statsValue}>{stats.packetsLost}</span>
            </div>
            <div className={classes.statsDivider} />
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>Decoder</span>
              <span className={classes.statsValue}>{stats.codec}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>NACK</span>
              <span className={classes.statsValue}>{stats.nackCount}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>PLI</span>
              <span className={classes.statsValue}>{stats.pliCount}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel}>FIR</span>
              <span className={classes.statsValue}>{stats.firCount}</span>
            </div>
          </div>
        )}
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
          <audio ref={this.audioRef} autoPlay />

          {/* Back button + device name */}
          <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconButton className={classes.backButton} onClick={this.handleClose} style={{ width: 32, height: 32, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              <ArrowBackBold style={{ fontSize: 18 }} />
            </IconButton>
            <div style={{ borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 500, color: Colors.white, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              {this.props.directAddress || (device ? deviceNamePretty(device) : 'Body')}
            </div>
          </div>

          {this.renderHud()}
          {connected && this.renderStatsOverlay()}
          {!connected && this.renderConnectOverlay()}
          {connected && !this.isMobile() && this.renderWasdKeys()}
          {connected && this.renderCameraSwitcher(false)}
          {connected && this.renderJoystick()}
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
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
          <div style={{ position: 'relative', background: Colors.black }}>
            <video
              ref={this.videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', aspectRatio: '4/3', display: 'block' }}
            />
            <audio ref={this.audioRef} autoPlay />
            {connected && this.renderHud()}
            {connected && this.renderStatsOverlay()}
            {connected && this.renderCameraSwitcher(true)}
            {connected && this.renderJoystick()}
          </div>
          <div className={classes.portraitContent}>
            {!connected && (
              <>
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
              </>
            )}
            {connected && (
              <Button
                variant="contained"
                className={classes.portraitButton}
                style={{ background: Colors.red400, color: Colors.white }}
                onClick={this.handleDisconnect}
              >
                Disconnect
              </Button>
            )}
            <div className={classes.infoBox}>
              <div className={classes.infoRow}>
                <InfoOutline style={{ fontSize: 18 }} />
                <span>The comma body must be powered on and ignition must be started to connect.</span>
              </div>
              <div className={classes.infoRow}>
                <ScreenRotation style={{ fontSize: 18 }} />
                <span>Rotate your device to landscape for the best experience.</span>
              </div>
            </div>
          </div>
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
