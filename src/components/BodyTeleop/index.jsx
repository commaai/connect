import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Button } from '@material-ui/core';

import Colors from '../../colors';
import { deviceNamePretty } from '../../utils';
import { BodyTeleopConnection, checkSslTrust } from '../../utils/bodyteleop';

import styles from './styles';
import Navigation from './Navigation';
import StatusBar, { useStats, StatsPanel } from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

const BodyTeleop = ({ dongleId, device, directAddress, onClose, classes }) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState(null);
  const [connectProgress, setConnectProgress] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [error, setError] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [activeCamera, setActiveCamera] = useState('driver');
  const [showSslTrust, setShowSslTrust] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);

  const videoRef = useRef(null);
  const streamsRef = useRef({});
  const connectionRef = useRef(null);
  const latencyCallbackRef = useRef(null);
  const switchTimerRef = useRef(null);

  // Create connection once
  useEffect(() => {
    const progressMap = {
      'Preparing connection...': 10,
      'Finding network path...': 20,
      'Reaching device...': 30,
      'Device responded': 85,
      'Establishing connection...': 92,
      'Receiving video...': 97,
    };

    const conn = new BodyTeleopConnection({
      onConnectionState: (state) => {
        setConnectionState(state);
        if (state !== 'connecting') {
          setStatusMessage(null);
          setConnectProgress(0);
        }
      },
      onStatusMessage: (msg) => {
        setStatusMessage(msg);
        setConnectProgress(progressMap[msg] || 0);
      },
      onBatteryLevel: setBatteryLevel,
      onConnectionReplaced: (data) => {
        setError(data || 'Connection replaced');
        setConnectionState('failed');
        conn.cleanup();
      },
      onVideoTrack: (_cameraName, stream) => {
        streamsRef.current.camera = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      },
      onLatencyUpdate: (latency) => {
        if (latencyCallbackRef.current) latencyCallbackRef.current(latency);
      },
    });

    connectionRef.current = conn;
    const onBeforeUnload = () => conn.disconnect();
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      conn.disconnect();
    };
  }, []);

  // Landscape detection
  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    setIsLandscape(query.matches);
    const handler = (e) => setIsLandscape(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  // Re-attach video stream on orientation change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = streamsRef.current.camera || null;
    }
  }, [isLandscape]);

  const handleConnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    setError(null);
    setShowSslTrust(false);
    setActiveCamera('driver');
    try {
      if (directAddress) {
        if (window.location.protocol === 'https:' && directAddress.includes('192.168')) {
          const sslStatus = await checkSslTrust(directAddress);
          if (sslStatus === 'unreachable') {
            setError('Could not reach device. Is the ignition on?');
            setConnectionState('failed');
            return;
          }
          if (sslStatus === 'untrusted') {
            setShowSslTrust(true);
            setConnectionState('disconnected');
            return;
          }
        }
        await conn.connectDirect(directAddress);
      } else {
        await conn.connect(dongleId);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [dongleId, directAddress]);

  // SSL trust message listener
  useEffect(() => {
    const handler = (evt) => {
      if (evt.data?.type === 'ssl_cert_accepted') {
        setShowSslTrust(false);
        handleConnect();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleConnect]);

  // Auto-connect on mount
  useEffect(() => {
    handleConnect();
  }, [handleConnect]);

  const handleDisconnect = useCallback(() => {
    setError(null);
    connectionRef.current?.disconnect();
  }, []);

  const handleClose = useCallback(() => {
    handleDisconnect();
    if (onClose) onClose();
  }, [handleDisconnect, onClose]);

  const switchCamera = useCallback((cameraName) => {
    setActiveCamera((prev) => {
      if (cameraName === prev) return prev;
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        connectionRef.current?.switchCamera(cameraName);
      }, 200);
      return cameraName;
    });
  }, []);

  const connection = connectionRef.current;
  const connected = connectionState === 'connected';
  const deviceName = directAddress || (device ? deviceNamePretty(device) : (isLandscape ? 'Body' : 'Body Teleop'));

  // Stats state lives in a hook, shared between StatusBar (toggle) and StatsPanel (display)
  const statsState = useStats(connection, connectionState, latencyCallbackRef);

  const videoProps = {
    classes, videoRef, isLandscape, connectionState, error,
    statusMessage, connectProgress, showSslTrust, directAddress,
    onConnect: handleConnect, batteryLevel,
  };

  if (isLandscape) {
    return (
      <div className={classes.root}>
        <div className={classes.videoContainer}>
          <Video {...videoProps} />
          <Navigation classes={classes} onClose={handleClose} deviceName={deviceName} isLandscape />
          {connected && (
            <>
              <StatusBar
                classes={classes}
                connectionState={connectionState}
                batteryLevel={batteryLevel}
                isLandscape
                videoRef={videoRef}
                {...statsState}
              />
              <Joystick
                classes={classes}
                connection={connection}
                activeCamera={activeCamera}
                isLandscape
                onGamepadChange={setGamepadConnected}
                onSwitchCamera={switchCamera}
                gamepadConnected={gamepadConnected}
              />
              <ControlsBar
                classes={classes}
                connection={connection}
                activeCamera={activeCamera}
                onSwitchCamera={switchCamera}
                gamepadConnected={gamepadConnected}
                videoRef={videoRef}
                isLandscape
              />
            </>
          )}
        </div>
      </div>
    );
  }

  // Portrait
  return (
    <div className={classes.root}>
      <Navigation classes={classes} onClose={handleClose} deviceName={deviceName} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {connected && (
          <StatusBar
            classes={classes}
            connectionState={connectionState}
            batteryLevel={batteryLevel}
            videoRef={videoRef}
            {...statsState}
          />
        )}
        <div style={{ position: 'relative' }}>
          <Video {...videoProps} />
          {connected && statsState.showStats && (
            <StatsPanel classes={classes} {...statsState} />
          )}
        </div>
        {connected ? (
          <>
            <ControlsBar
              classes={classes}
              connection={connection}
              activeCamera={activeCamera}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
              videoRef={videoRef}
            />
            <Joystick
              classes={classes}
              connection={connection}
              activeCamera={activeCamera}
              onGamepadChange={setGamepadConnected}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
            />
            <div style={{ flexShrink: 0, padding: '8px 16px 16px' }}>
              <Button
                variant="contained"
                className={classes.portraitButton}
                style={{ background: Colors.red400, color: Colors.white, width: '100%' }}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(BodyTeleop));
