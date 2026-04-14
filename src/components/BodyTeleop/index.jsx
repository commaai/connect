import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Button } from '@material-ui/core';

import Colors from '../../colors';
import { deviceNamePretty } from '../../utils';
import { BodyTeleopConnection } from '../../utils/bodyteleop';
import Navigation from './Navigation';
import StatusBar, { useStats, StatsPanel } from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

const BodyTeleop = ({ dongleId, device, directAddress, onClose }) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState(null);
  const [connectProgress, setConnectProgress] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [error, setError] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [activeCamera, setActiveCamera] = useState('driver');

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
    setActiveCamera('driver');
    try {
      if (directAddress) {
        await conn.connectDirect(directAddress);
      } else {
        await conn.connect(dongleId);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [dongleId, directAddress]);

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
    videoRef, connectionState, error,
    statusMessage, connectProgress,
    onConnect: handleConnect,
  };

  if (isLandscape) {
    return (
      <div className="fixed inset-0 z-[1300] bg-[#030404] flex flex-col">
        <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#030404]">
          <Video {...videoProps} />
          <Navigation onClose={handleClose} deviceName={deviceName} isLandscape />
          {connected && (
            <>
              <StatusBar
                connectionState={connectionState}
                batteryLevel={batteryLevel}
                isLandscape
                {...statsState}
              />
              {statsState.showStats && (
                <StatsPanel isLandscape {...statsState} />
              )}
              <Joystick
                connection={connection}
                activeCamera={activeCamera}
                isLandscape
                onGamepadChange={setGamepadConnected}
                onSwitchCamera={switchCamera}
                gamepadConnected={gamepadConnected}
              />
              <ControlsBar
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
    <div className="fixed inset-0 z-[1300] bg-[#030404] flex flex-col">
      <Navigation onClose={handleClose} deviceName={deviceName} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {connected && (
          <StatusBar
            connectionState={connectionState}
            batteryLevel={batteryLevel}
            videoRef={videoRef}
            {...statsState}
          />
        )}
        <div className="relative flex items-center justify-center overflow-hidden bg-[#030404] flex-none">
          <Video {...videoProps} />
          {connected && statsState.showStats && (
            <StatsPanel {...statsState} />
          )}
        </div>
        {connected ? (
          <>
            <ControlsBar
              connection={connection}
              activeCamera={activeCamera}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
              videoRef={videoRef}
            />
            <Joystick
              connection={connection}
              activeCamera={activeCamera}
              onGamepadChange={setGamepadConnected}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
            />
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

export default connect(stateToProps)(BodyTeleop);
