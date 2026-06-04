import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { IconButton } from '@material-ui/core';

import { ArrowBackBold } from '../../icons';
import { deviceNamePretty } from '../../utils';
import { WebRTCConnection } from '../../utils/webrtc';
import StatusBar, { useStats, StatsPanel } from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

const progressMap = {
  'Gathering ICE candidates...': 20,
  'Device processing candidates...': 40,
  'Candidate accepted...': 85,
  'Establishing connection...': 92,
  'Receiving video...': 97,
};

const BodyTeleop = ({ dongleId, device, onClose }) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState(null);
  const [connectProgress, setConnectProgress] = useState(0);
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [activeCamera, setActiveCamera] = useState('wideRoad');

  const [gamepadConnected, setGamepadConnected] = useState(false);

  const videoRef = useRef(null);
  const streamsRef = useRef({});
  const connectionRef = useRef(null);
  const latencyCallbackRef = useRef(null);
  const switchTimerRef = useRef(null);
  const timeoutTimerRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  
  useEffect(() => {
    const conn = new WebRTCConnection({
      onConnectionState: (state) => {
        setConnectionState(state);
        if (state !== 'connecting') {
          setStatusMessage(null);
          setConnectProgress(0);
        }
        if (state === 'failed') {
          setError((prev) => prev || 'Could not reach device. Is the ignition on?');
        }
      },
      onStatusMessage: (msg) => {
        setStatusMessage(msg);
        setConnectProgress(progressMap[msg] || 0);
      },
      onBatteryLevel: setBattery,
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

  useEffect(() => {
    const onVisibilityChange = () => {
      clearTimeout(timeoutTimerRef.current);
      if (document.hidden) {
        timeoutTimerRef.current = setTimeout(() => {
          connectionRef.current?.disconnect();
          setError('Session timed out');
        }, 30000);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(timeoutTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    setIsLandscape(query.matches);
    const handler = (e) => setIsLandscape(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  const handleConnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    setError(null);
    setActiveCamera('wideRoad');
    try {
      await conn.connect(dongleId);
    } catch (err) {
      setError(err.message);
    }
  }, [dongleId]);

  useEffect(() => {
    handleConnect();
  }, []);

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

  const handleQualityChange = useCallback((nextQuality) => {
    connectionRef.current?.setQuality(nextQuality);
  }, []);

  const connection = connectionRef.current;
  const connected = connectionState === 'connected';
  const deviceName = device ? deviceNamePretty(device) : (isLandscape ? 'Body' : 'Body Teleop');

  const {
    showStats, toggleStats, closeStats, stats, latency, latencyHistory,
  } = useStats(connection, connectionState, latencyCallbackRef);
  const statsPanelProps = { stats, latency, latencyHistory };
  const videoProps = {
    videoRef, connectionState, error,
    statusMessage, connectProgress,
    onConnect: handleConnect,
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-[#030404] flex flex-col touch-pan-x touch-pan-y h-full w-full overflow-hidden">
      <div
        className={isLandscape
          ? 'absolute left-2 top-2 z-20 flex items-center gap-1'
          : 'flex items-center px-3 py-2 bg-[#30373B] border-b border-white/10 min-h-[48px] z-10'}
      >
        <IconButton
          className={isLandscape ? 'text-white p-2 w-10 h-10 bg-glass' : 'text-white p-2'}
          onClick={handleClose}
        >
          <ArrowBackBold style={{ fontSize: 20 }} />
        </IconButton>
        <div
          className={isLandscape
            ? 'rounded-[20px] px-3.5 h-10 flex items-center text-base font-medium text-white bg-glass'
            : 'text-base font-medium ml-2 flex-1'}
        >
          {deviceName}
        </div>
      </div>
      {connected && (
        <div className='relative'>
          <StatusBar
            battery={battery}
            className={isLandscape
              ? 'absolute top-3 right-3 z-30 flex items-center gap-2'
              : 'relative z-30 flex items-center justify-end p-2 gap-2'}
            toggleStats={toggleStats}
            onQualityChange={handleQualityChange}
            onSettingsOpen={closeStats}
          />
          {showStats ? <StatsPanel isLandscape={isLandscape} {...statsPanelProps} /> : <></>}
        </div>
      )}
      <Video key="teleop-video" {...videoProps} className={isLandscape ? "h-full" : "aspect-[16/9]"} />
      {connected && (
        <>
          <ControlsBar
            activeCamera={activeCamera}
            onSwitchCamera={switchCamera}
            gamepadConnected={gamepadConnected}
            videoRef={videoRef}
            isLandscape={isLandscape}
          />
          <div
            className={isLandscape
              ? 'absolute bottom-4 right-4 z-10 w-[160px] h-[160px]'
              : 'flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden'}
          >
            <Joystick
              connection={connection}
              activeCamera={activeCamera}
              className={isLandscape
                ? 'relative w-full h-full'
                : 'relative w-auto h-full aspect-square max-w-full'}
              onGamepadChange={setGamepadConnected}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
            />
          </div>
        </>
      )}
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(BodyTeleop);
