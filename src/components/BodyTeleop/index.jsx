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
import { isMobile, isChrome, isFirefox, isSafari, isIos } from '../../utils/browser';
import { BodyTeleopConnection, checkSslTrust, getDeviceBaseUrl } from '../../utils/bodyteleop';
import { ArrowBackBold } from '../../icons';

const QUICK_SOUNDS = [
  { key: 'engage', label: 'Engage' },
  { key: 'disengage', label: 'Disengage' },
  { key: 'prompt', label: 'Prompt' },
  { key: 'warning', label: 'Warning' },
];

const CAMERAS = [
  { key: 'driver', label: 'front', num: '1' },
  { key: 'wideRoad', label: 'rear', num: '2' },
];

const styles = () => ({
  root: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1300,
    background: Colors.black,
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
  hudBottomCenter: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  hudPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    height: 28,
    padding: '0 10px',
    borderRadius: 14,
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
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
    boxShadow: 'inset 0 0 20px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)',
    border: '1.5px solid rgba(255,255,255,0.2)',
    backdropFilter: 'blur(12px)',
    touchAction: 'none',
    '@media (min-width: 768px)': {
      width: 160,
      height: 160,
    },
  },
  joystickAreaSquare: {
    borderRadius: 16,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
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
    width: 52,
    height: 52,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
    boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.25)',
    willChange: 'left, top',
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
  // Controls group (camera + sounds)
  controlsGroup: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: '10px',
    borderRadius: 14,
    padding: 8,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
  },
  controlsGroupPortrait: {
    position: 'relative',
    bottom: 'auto',
    left: 'auto',
    transform: 'none',
    alignSelf: 'stretch',
    borderRadius: 0,
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
  },
  controlsColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '5px',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  portraitRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
  },
  portraitCategory: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  controlsLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    minWidth: 52,
    flexShrink: 0,
  },
  controlsLabelPortrait: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    minWidth: 36,
    flexShrink: 0,
  },
  controlsLabelBelow: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 1,
  },
  controlsButtons: {
    display: 'flex',
    gap: '3px',
    alignItems: 'center',
  },
  cameraButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: 32,
    padding: '0 10px',
    borderRadius: 8,
    fontSize: 11,
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
  cameraButtonPortrait: {
    width: 28,
    height: 28,
    padding: 0,
    fontSize: 11,
    justifyContent: 'center',
  },
  cameraButtonKey: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.15)',
  },
  soundButton: {
    height: 32,
    padding: '0 10px',
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': {
      color: Colors.white,
      background: 'rgba(255,255,255,0.2)',
    },
  },
  soundButtonPortrait: {
    height: 28,
    padding: '0 8px',
    fontSize: 9,
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
    height: 28,
    padding: '0 10px',
    borderRadius: 14,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  audioLevelRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 0',
    gap: '6px',
  },
  audioLevelIcon: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    flexShrink: 0,
    width: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioLevelTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  audioLevelFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 80ms linear',
  },
  screenshotButton: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
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
  controllerToggle: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
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
  controllerToggleOff: {
    opacity: 0.4,
  },
  actionButton: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: Colors.white70,
    cursor: 'pointer',
    '&:hover': {
      background: 'rgba(255,255,255,0.2)',
      color: Colors.white,
    },
  },
  actionButtonIcon: {
    fontSize: 18,
  },
  actionButtonPortrait: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  actionButtonIconPortrait: {
    fontSize: 16,
  },
  // Controller overlay
  controllerOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '24px',
    pointerEvents: 'none',
  },
  triggerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  triggerShape: {
    width: 48,
    height: 80,
    borderRadius: '8px 8px 24px 24px',
    border: '2px solid rgba(255,255,255,0.25)',
    position: 'relative',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(8px)',
  },
  triggerFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    transition: 'height 50ms linear',
  },
  triggerInnerLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.4)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  triggerLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  controllerJoystick: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(8px)',
    border: '2px solid rgba(255,255,255,0.2)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controllerJoystickTrack: {
    position: 'absolute',
    top: '50%',
    left: 12,
    right: 12,
    height: 2,
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 1,
  },
  controllerJoystickThumb: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
    boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.25)',
    position: 'absolute',
    transition: 'left 50ms linear',
  },
  controllerJoystickLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  controllerJoystickArrows: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-55%)',
    fontSize: 14,
    color: 'rgba(255,255,255,0.2)',
    userSelect: 'none',
  },
  bumperShape: {
    width: 48,
    height: 24,
    borderRadius: '12px 12px 4px 4px',
    border: '2px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 100ms, border-color 100ms',
  },
  bumperActive: {
    background: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  bumperLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    transition: 'color 100ms',
  },
  bumperLabelActive: {
    color: 'rgba(255,255,255,0.9)',
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
      showStats: false,
      stats: null,
      videoAspectRatio: '16/9',
      activeCamera: 'driver',
      gamepadConnected: false,
      gamepadSteering: 0,
      gamepadGas: 0,
      gamepadBrake: 0,
      gamepadLB: false,
      gamepadRB: false,
      showSslTrust: false,
      streamMuted: true,
      micMuted: true,
      micPermission: 'unknown',
      micLevel: 0,
      remoteAudioLevel: 0,
    };

    this.videoRef = React.createRef();
    this.audioRef = React.createRef();
    this.joystickAreaRef = React.createRef();
    this.touchId = null;
    this.mouseDragging = false;
    this.streams = {};
    this.remoteAudioStream = null;
    this.micAnalyser = null;
    this.remoteAnalyser = null;
    this.audioLevelContext = null;
    this.micAnalyserSource = null;
    this.remoteAnalyserSource = null;
    this.audioLevelInterval = null;

    this.connection = new BodyTeleopConnection({
      onConnectionState: (connectionState) => {
        if (connectionState !== 'connected') {
          this.remoteAudioStream = null;
          if (this.audioRef.current) {
            this.audioRef.current.srcObject = null;
          }
        }
        this.setState({
          connectionState,
          ...(connectionState !== 'connecting' ? { statusMessage: null, connectProgress: 0 } : {}),
          ...(connectionState !== 'connected' ? { micMuted: true } : {}),
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
      onVideoTrack: (cameraName, stream) => {
        this.streams[cameraName] = stream;
        if (cameraName === this.state.activeCamera && this.videoRef.current) {
          this.videoRef.current.srcObject = stream;
        }
      },
      onAudioTrack: (stream) => this.setRemoteAudioStream(stream),
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
    this.toggleStreamMuted = this.toggleStreamMuted.bind(this);
    this.handleMicToggle = this.handleMicToggle.bind(this);
    this.handlePlaySound = this.handlePlaySound.bind(this);
    this.syncAudioElement = this.syncAudioElement.bind(this);
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
    if (prevState.streamMuted !== this.state.streamMuted) {
      this.syncAudioElement();
    }
    // Re-attach video/audio streams when orientation changes (new DOM elements)
    if (prevState.isLandscape !== this.state.isLandscape) {
      if (this.videoRef.current) {
        this.videoRef.current.srcObject = this.streams[this.state.activeCamera] || null;
      }
      if (this.audioRef.current) {
        this.audioRef.current.srcObject = this.remoteAudioStream;
        this.syncAudioElement();
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
    this.stopStatsPolling();
    this.cleanupAudioAnalysers();
    this.connection.disconnect();
  }

  startStatsPolling() {
    this.stopStatsPolling();
    this.prevStatsTimestamp = null;
    this.prevBytesReceived = null;
    this.prevFramesDecoded = null;
    this.statsInterval = setInterval(() => this.pollStats(), 1000);
    this.pollStats();
    this.audioLevelInterval = setInterval(() => this.pollAudioLevels(), 80);
  }

  stopStatsPolling() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
    this.cleanupAudioAnalysers();
    this.setState({ stats: null, micLevel: 0, remoteAudioLevel: 0 });
  }

  ensureAudioLevelContext() {
    if (!this.audioLevelContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.audioLevelContext = new AudioContextClass();
    }
    return this.audioLevelContext;
  }

  getAudioLevel(analyser) {
    if (!analyser) return 0;
    if (!this.audioLevelData) {
      this.audioLevelData = new Uint8Array(analyser.frequencyBinCount);
    }
    const data = this.audioLevelData;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  syncAnalyser(stream, analyser, source, ctx) {
    if (stream && (!analyser || source?._trackedStream !== stream)) {
      if (source) source.disconnect();
      const newAnalyser = ctx.createAnalyser();
      newAnalyser.fftSize = 256;
      const newSource = ctx.createMediaStreamSource(stream);
      newSource._trackedStream = stream;
      newSource.connect(newAnalyser);
      return { analyser: newAnalyser, source: newSource };
    }
    if (!stream && analyser) {
      if (source) source.disconnect();
      return { analyser: null, source: null };
    }
    return { analyser, source };
  }

  pollAudioLevels() {
    if (!this.state.showStats) return;

    const ctx = this.ensureAudioLevelContext();
    if (!ctx) return;

    const mic = this.syncAnalyser(this.connection.localMicStream, this.micAnalyser, this.micAnalyserSource, ctx);
    this.micAnalyser = mic.analyser;
    this.micAnalyserSource = mic.source;

    const remote = this.syncAnalyser(this.remoteAudioStream, this.remoteAnalyser, this.remoteAnalyserSource, ctx);
    this.remoteAnalyser = remote.analyser;
    this.remoteAnalyserSource = remote.source;

    const micLevel = this.getAudioLevel(this.micAnalyser);
    const remoteAudioLevel = this.getAudioLevel(this.remoteAnalyser);

    if (Math.abs(micLevel - this.state.micLevel) >= 0.02 ||
        Math.abs(remoteAudioLevel - this.state.remoteAudioLevel) >= 0.02) {
      this.setState({ micLevel, remoteAudioLevel });
    }
  }

  cleanupAudioAnalysers() {
    if (this.micAnalyserSource) {
      this.micAnalyserSource.disconnect();
      this.micAnalyserSource = null;
    }
    this.micAnalyser = null;
    if (this.remoteAnalyserSource) {
      this.remoteAnalyserSource.disconnect();
      this.remoteAnalyserSource = null;
    }
    this.remoteAnalyser = null;
    if (this.audioLevelContext) {
      this.audioLevelContext.close().catch(() => {});
      this.audioLevelContext = null;
    }
  }

  setRemoteAudioStream(stream) {
    this.remoteAudioStream = stream;
    if (this.audioRef.current) {
      this.audioRef.current.srcObject = stream;
    }
    this.syncAudioElement();
  }

  syncAudioElement() {
    if (!this.audioRef.current) return;
    this.audioRef.current.muted = this.state.streamMuted;
    const playPromise = this.audioRef.current.play?.();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
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
    const cameraKeys = { 1: 'driver', 2: 'wideRoad' };
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
    const flip = this.isRearCamera() ? -1 : 1;
    this.connection.setJoystick(flip * x, y);
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
    this.setFlippedJoystick(dy, -dx);
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
        if (window.location.protocol === 'https:') {
          const trusted = await checkSslTrust(directAddress);
          if (!trusted) {
            this.setState({ showSslTrust: true, connectionState: 'disconnected' });
            return;
          }
        }
        await this.connection.connectDirect(directAddress);
      } else {
        await this.connection.connect(dongleId);
      }
    } catch (err) {
      this.setState({ error: err.message });
    }
  }

  handleDisconnect() {
    this.setState({ error: null, micMuted: true });
    this.connection.disconnect();
  }

  toggleStreamMuted() {
    this.setState((prev) => ({ streamMuted: !prev.streamMuted }));
  }

  async handleMicToggle() {
    const { micMuted } = this.state;
    try {
      await this.connection.setMicrophoneMuted(!micMuted);
      this.setState({
        micMuted: !micMuted,
        ...(micMuted ? { micPermission: 'granted' } : {}),
      });
    } catch (_) {
      this.setState({ micPermission: 'denied', micMuted: true });
    }
  }

  handlePlaySound(sound) {
    this.connection.playSound(sound).catch((err) => {
      console.error('Failed to play body sound:', err);
      this.setState({ error: err.message });
    });
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
    const rt = gp.axes[5] !== undefined ? (gp.axes[5] + 1) / 2
      : gp.buttons[7] ? gp.buttons[7].value : 0;
    const lt = gp.axes[4] !== undefined ? (gp.axes[4] + 1) / 2
      : gp.buttons[6] ? gp.buttons[6].value : 0;

    const throttle = lt - rt; // negative = forward (gas), positive = backward (brake)

    // Bumpers: LB = button 4 (rear camera), RB = button 5 (front camera)
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
      this.switchCamera('wideRoad');
    }
    if (rb && !this.prevBumpers.rb) {
      this.switchCamera('driver');
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

  renderConnectionIndicator() {
    const { classes } = this.props;
    const { connectionState } = this.state;

    return (
      <div className={classes.hudBottomCenter}>
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
      </div>
    );
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
    const connected = connectionState === 'connected';

    return (
      <div className={classes.hudTopRight}>
        {connected && (
          <div
            className={classes.statsToggleButton}
            onClick={() => this.setState((prev) => ({ showStats: !prev.showStats }))}
            title="Toggle stats"
          >
            STATS
          </div>
        )}
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
                      className={`${classes.cameraButton} ${classes.cameraButtonPortrait} ${activeCamera === cam.key ? classes.cameraButtonActive : classes.cameraButtonInactive}`}
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
                    className={`${classes.soundButton} ${classes.soundButtonPortrait}`}
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
                  className={`${classes.cameraButton} ${activeCamera === cam.key ? classes.cameraButtonActive : classes.cameraButtonInactive}`}
                  onClick={() => this.switchCamera(cam.key)}
                >
                  <span className={classes.cameraButtonKey}>{cam.num}</span>
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
                className={classes.soundButton}
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
              className={`${classes.actionButton} ${streamMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.toggleStreamMuted}
              title={streamMuted ? 'Unmute stream audio' : 'Mute stream audio'}
            >
              {streamMuted ? <VolumeOff className={classes.actionButtonIcon} /> : <VolumeUp className={classes.actionButtonIcon} />}
            </div>
            <div
              className={`${classes.actionButton} ${micMuted ? classes.controllerToggleOff : ''}`}
              onClick={this.handleMicToggle}
              title={micTitle}
            >
              {micMuted ? <MicOff className={classes.actionButtonIcon} /> : <Mic className={classes.actionButtonIcon} />}
            </div>
          </div>
          <span className={classes.controlsLabelBelow}>Mic / Sound</span>
        </div>
        <div className={classes.controlsColumn}>
          <div className={classes.controlsButtons}>
            <div
              className={classes.actionButton}
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
    const portraitStyle = portrait ? {
      position: 'relative',
      bottom: 'auto',
      right: 'auto',
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
    } : undefined;

    return (
      <div
        ref={this.joystickAreaRef}
        className={`${classes.joystickArea} ${classes.joystickAreaSquare}`}
        style={portraitStyle}
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
          <span className={`${classes.bumperLabel} ${gamepadLB ? classes.bumperLabelActive : ''}`}>Rear Camera</span>
          <div
            className={`${classes.bumperShape} ${gamepadLB ? classes.bumperActive : ''}`}
            style={activeCamera === 'wideRoad' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
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
          <span className={`${classes.bumperLabel} ${gamepadRB ? classes.bumperLabelActive : ''}`}>Front Camera</span>
          <div
            className={`${classes.bumperShape} ${gamepadRB ? classes.bumperActive : ''}`}
            style={activeCamera === 'driver' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
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


  renderStatsOverlay() {
    const { classes } = this.props;
    const { showStats, stats, micLevel, remoteAudioLevel, micMuted, streamMuted } = this.state;

    if (!showStats || !stats) return null;

    const micColor = micMuted ? 'rgba(255,255,255,0.15)' : `rgba(76,175,80,${0.5 + micLevel * 0.5})`;
    const audioColor = streamMuted ? 'rgba(255,255,255,0.15)' : `rgba(66,165,245,${0.5 + remoteAudioLevel * 0.5})`;

    return (
      <div className={classes.statsToggle}>
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

  handleOpenTrustPage() {
    const { directAddress } = this.props;
    const trustUrl = `${getDeviceBaseUrl(directAddress)}/trust`;
    window.open(trustUrl, '_blank');
  }

  getSslInstructions() {
    if (isSafari()) {
      return [
        'Make sure Body ignition is ON',
        'Click "Open Trust Page"',
        'Tap "Show Details"',
        'Tap "visit this website"',
        'Tap "Visit Website" to confirm',
      ];
    }
    if (isFirefox()) {
      return [
        'Make sure Body ignition is ON',
        'Click "Open Trust Page"',
        'Click "Advanced\u2026"',
        'Click "Accept Risk and Continue"',
      ];
    }
    if (isChrome() && isIos()) {
      return [
        'Make sure Body ignition is ON',
        'Click "Open Trust Page"',
        'Tap "Advanced"',
        'Tap "Proceed to ... (unsafe)"',
      ];
    }
    // Chrome desktop/Android
    return [
      'Make sure Body ignition is ON',
      'Click "Open Trust Page"',
      'Click "Advanced"',
      'Click "Proceed to ... (unsafe)"',
    ];
  }

  renderSslTrustDialog() {
    const { classes, directAddress } = this.props;
    const { isLandscape } = this.state;
    const trustUrl = `${getDeviceBaseUrl(directAddress)}/trust`;
    const steps = this.getSslInstructions();

    return (
      <div className={classes.connectOverlay} style={{ overflow: 'auto' }}>
        <div className={classes.connectContent} style={{
          maxWidth: isLandscape ? 520 : 380,
          width: '90%',
          background: Colors.grey900,
          borderRadius: 16,
          padding: isLandscape ? 16 : 24,
          gap: isLandscape ? 10 : 16,
          margin: 'auto',
        }}>
          <Typography style={{ fontSize: isLandscape ? 16 : 18, fontWeight: 600 }}>
            Trust Device Certificate
          </Typography>
          <Typography style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white60, lineHeight: 1.5, textAlign: 'center' }}>
            Your browser needs to trust this local network device&apos;s self-signed cert
            before connecting. Follow these steps:
          </Typography>
          <div style={{
            textAlign: 'left',
            background: Colors.white08,
            borderRadius: 12,
            padding: isLandscape ? '8px 12px' : '12px 16px',
            width: '100%',
          }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: i < steps.length - 1 ? (isLandscape ? 2 : 6) : 0 }}>
                <span style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white40, fontWeight: 600, minWidth: 16 }}>{i + 1}.</span>
                <span style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white70, lineHeight: 1.4 }}>{step}</span>
              </div>
            ))}
          </div>
          <Button
            className={classes.connectButton}
            onClick={() => this.handleOpenTrustPage()}
            disableRipple
          >
            Open Trust Page
          </Button>
          <Typography style={{ fontSize: isLandscape ? 10 : 12, color: Colors.white40, wordBreak: 'break-all', textAlign: 'center' }}>
            {trustUrl}
          </Typography>
          <Typography style={{ fontSize: isLandscape ? 12 : 14, color: Colors.white70 }}>
            After accepting, this page will connect automatically.
          </Typography>
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

          {this.renderHud()}
          {connected && this.renderStatsOverlay()}
          {this.state.showSslTrust ? this.renderSslTrustDialog() : !connected && this.renderConnectOverlay()}
          {connected && this.state.gamepadConnected
            ? this.renderControllerOverlay()
            : connected && this.renderJoystick()}
          {connected && this.renderControls(false)}
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
            {connected && (
              <div className={classes.hudTopRight}>
                <div
                  className={classes.statsToggleButton}
                  onClick={() => this.setState((prev) => ({ showStats: !prev.showStats }))}
                  title="Toggle stats"
                >
                  STATS
                </div>
              </div>
            )}
            {connected && this.renderStatsOverlay()}
          </div>
          {connected && this.renderControls(true)}
          {connected && this.state.gamepadConnected
            ? this.renderControllerOverlay()
            : connected && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0, overflow: 'hidden' }}>
                {this.renderJoystick(true)}
              </div>
            )}
          {!connected && (
            <div className={classes.portraitContent} style={{ overflow: 'auto' }}>
              {this.state.showSslTrust ? this.renderSslTrustDialog() : (
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
                  <div className={classes.infoBox}>
                    <div className={classes.infoRow}>
                      <InfoOutline style={{ fontSize: 18 }} />
                      <span>The comma body must be powered on and ignition must be started to connect.</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
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
