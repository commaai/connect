import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { ArrowBackBold } from '../../icons';
import { deviceNamePretty } from '../../utils';
import { WebRTCConnection } from '../../utils/webrtc';
import { useIsLandscape } from '../../hooks/window';
import StatusBar from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

const BodyTeleop = ({ dongleId, device, onClose }) => {
  const [connectionState, setConnectionState] = useState('none');
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);
  const [activeCamera, setActiveCamera] = useState('wideRoad');
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [inputActive, setInputActive] = useState(false);
  const [connectionTotalMs, setConnectionTotalMs] = useState(null);

  const videoRef = useRef(null);
  const streamsRef = useRef({});
  const connectionRef = useRef(null);
  const latencyCallbackRef = useRef(null);
  const switchTimerRef = useRef(null);
  const timeoutTimerRef = useRef(null);
  const connectStartedAtRef = useRef(null);
  const firstFrameMeasuredRef = useRef(false);

  const isLandscape = useIsLandscape();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const conn = new WebRTCConnection({
      onConnectionState: (state, reason) => {
        setConnectionState(state);
        if (state === 'failed') {
          // don't overwrite the original error reason
          setError((prev) => prev || reason || 'Could not reach device. Is the ignition on?');
        }
      },
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

  const handleConnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    setError(null);
    setActiveCamera('wideRoad');
    setConnectionTotalMs(null);
    connectStartedAtRef.current = performance.now();
    firstFrameMeasuredRef.current = false;
    try {
      await conn.connect(dongleId);
    } catch (err) {
      setError(err.message);
      connectStartedAtRef.current = null;
    }
  }, [dongleId]);

  useEffect(() => {
    handleConnect();
  }, []);

  const handleDisconnect = useCallback(() => {
    setError(null);
    setConnectionTotalMs(null);
    connectStartedAtRef.current = null;
    firstFrameMeasuredRef.current = false;
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

  const handleFirstFrame = useCallback(() => {
    if (connectStartedAtRef.current == null || firstFrameMeasuredRef.current) return;
    firstFrameMeasuredRef.current = true;
    setConnectionTotalMs(performance.now() - connectStartedAtRef.current);
  }, []);

  const connection = connectionRef.current;
  const connected = connectionState === 'connected';
  const deviceName = device ? deviceNamePretty(device) : (isLandscape ? 'Body' : 'Body Teleop');

  const videoProps = {
    videoRef, connectionState, error, connectionTotalMs,
    onFirstFrame: handleFirstFrame,
    onConnect: handleConnect,
  };

  return (
    <div className="fixed top-0 left-0 w-screen h-full z-[1300] bg-[#030404]">
      <div className={`
        absolute inset-0 bg-[#030404] flex flex-col touch-none
        overflow-hidden select-none [-webkit-touch-callout:none] [-webkit-text-size-adjust:none]
        mt-safe-top mb-safe-bottom ml-safe-left mr-safe-right
      `}>
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
              controlsDisabled={inputActive}
            />
            <div
              className={isLandscape
                ? 'absolute bottom-4 right-4 z-10 w-[160px] h-[160px]'
                : 'flex-1 flex items-center justify-center px-4 pb-12 pt-2 min-h-0 overflow-hidden'}
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
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(BodyTeleop);
