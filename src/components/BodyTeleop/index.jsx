import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { ArrowBackBold } from '../../icons';
import { deviceNamePretty } from '../../utils';
import { WebRTCConnection } from '../../utils/webrtc';
import StatusBar from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

const BodyTeleop = ({ dongleId, device, onClose }) => {
  const [connectionState, setConnectionState] = useState('none');
  const [connectStep, setConnectStep] = useState(null);
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [activeCamera, setActiveCamera] = useState('wideRoad');

  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [inputActive, setInputActive] = useState(false);
  const [screenshotMenuOpen, setScreenshotMenuOpen] = useState(false);

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
      onConnectionState: (state, reason) => {
        setConnectionState(state);
        if (state !== 'connecting') {
          setConnectStep(null);
        }
        if (state === 'failed') {
          // don't overwrite the original error reason
          setError((prev) => prev || reason || 'Could not reach device. Is the ignition on?');
        }
      },
      onConnectProgress: setConnectStep,
      onBatteryLevel: setBattery,
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

  const videoProps = {
    videoRef, connectionState, error,
    connectStep,
    onConnect: handleConnect,
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-[#030404] flex flex-col touch-none h-full w-full overflow-hidden select-none">
      <div
        className={isLandscape
          ? 'absolute left-2 top-2 z-20 flex items-center gap-1'
          : 'flex items-center px-3 py-2 bg-[#30373B] border-b border-white/10 min-h-[48px] z-10'}
      >
        <button
          className={isLandscape ? 'flex items-center rounded-full hover:text-white/90 text-white/60 p-2 w-10 h-10 bg-glass' : 'text-white p-2'}
          onClick={handleClose}
        >
          <ArrowBackBold style={{ fontSize: 20 }} />
        </button>
        <div
          className={isLandscape
            ? 'rounded-[20px] px-3.5 h-10 flex items-center text-base font-medium text-white bg-glass border-0'
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
            isLandscape={isLandscape}
            connection={connection}
            connectionState={connectionState}
            latencyCallbackRef={latencyCallbackRef}
            onQualityChange={handleQualityChange}
          />
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
            camerasDisabled={inputActive}
            onScreenshotMenuChange={setScreenshotMenuOpen}
          />
          <div
            className={isLandscape
              ? 'absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-10 w-[160px] h-[160px]'
              : 'flex-1 flex items-center justify-center pb-8 pt-2 min-h-0 overflow-hidden'}
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
              onInputActiveChange={setInputActive}
              disabled={screenshotMenuOpen}
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
