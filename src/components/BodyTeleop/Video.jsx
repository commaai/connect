import React, { useState, useEffect, useRef } from 'react';
import { Button, CircularProgress } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';

import { usePinchZoom } from '../../utils/usePinchZoom';

const CONNECTION_TIME_VISIBLE_MS = 1500;

const ConnectOverlay = ({ connectionState, error, onConnect }) => {
  const connecting = connectionState === 'connecting';
  const canRetry = connectionState === 'failed' || connectionState === 'disconnected';
  const retryLabel = connectionState === 'disconnected' ? 'Reconnect' : 'Retry';

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-3 pointer-events-auto">
        {connecting ? (
          <>
            <CircularProgress className="text-content/70" thickness={4} size={40} />
            <span className="text-xs text-content/50">Connecting...</span>
          </>
        ) : canRetry ? (
          <Button
            className="flex items-center gap-2 rounded-3xl px-6 py-2.5 text-content text-sm font-medium normal-case bg-danger/60 hover:bg-danger/70 cursor-pointer"
            onClick={onConnect}
            disableRipple
          >
            <Refresh style={{ fontSize: 20 }} />
            {retryLabel}
          </Button>
        ) : null}
        {error && (
          <div className="max-w-[280px] md:max-w-[450px] rounded-lg px-3 py-1.5 text-center text-xs text-danger-content !bg-danger/40 !select-text">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const Video = ({
  videoRef, connectionState, error, connectionTotalMs,
  onConnect, onFirstFrame, className, started
}) => {
  const connected = connectionState === 'connected';
  const [showConnectionTime, setShowConnectionTime] = useState(false);
  const containerRef = useRef(null);

  // Disable pinch-zoom once ignition is on so it doesn't fight the joystick.
  usePinchZoom(containerRef, videoRef, !started);

  useEffect(() => {
    if (connectionState !== 'connected') {
      setShowConnectionTime(false);
    }
  }, [connectionState]);

  const connectionTimeLabel = connectionTotalMs == null ? null : `${Math.round(connectionTotalMs)} ms`;

  useEffect(() => {
    if (connectionTimeLabel == null) {
      setShowConnectionTime(false);
      return undefined;
    }

    setShowConnectionTime(true);
    const timer = setTimeout(() => setShowConnectionTime(false), CONNECTION_TIME_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [connectionTimeLabel]);

  return (
    <div ref={containerRef} className={`relative w-full ${className} bg-scrim overflow-hidden`} style={{ touchAction: 'none' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPlaying={() => {
          onFirstFrame?.();
        }}
        className={`w-full h-full pointer-events-none object-contain`}
      />
      {connected && connectionTimeLabel && (
        <div className={`absolute bottom-5 left-1/2 z-10 -translate-x-1/2 select-none rounded bg-scrim/50 px-2 py-0.5 text-sm leading-4 text-content/70 pointer-events-none transition-opacity duration-500 ease-out ${showConnectionTime ? 'opacity-100' : 'opacity-0'}`}>
          {`connected in ${connectionTimeLabel}`}
        </div>
      )}
      {!connected && (
        <ConnectOverlay
          connectionState={connectionState}
          error={error}
          onConnect={onConnect}
        />
      )}
    </div>
  );
};

export default Video;
