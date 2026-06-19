import React, { useState, useEffect } from 'react';
import { Button, CircularProgress } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';

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
            <CircularProgress style={{ color: 'rgba(255, 255, 255, 0.7)' }} thickness={4} size={40} />
            <span className="text-xs text-white/50">Connecting...</span>
          </>
        ) : canRetry ? (
          <Button
            className="flex items-center gap-2 rounded-3xl px-6 py-2.5 text-white text-sm font-medium normal-case bg-red-600/60 hover:bg-red-600/70 cursor-pointer"
            onClick={onConnect}
            disableRipple
          >
            <Refresh style={{ fontSize: 20 }} />
            {retryLabel}
          </Button>
        ) : null}
        {error && (
          <div className={`max-w-[280px] md:max-w-[450px] rounded-lg px-3 py-1.5 text-center text-xs text-[#fca5a5] !bg-[rgba(220,38,38,0.4)] !select-text`}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const Video = ({
  videoRef, connectionState, error, connectionTotalMs,
  onConnect, onFirstFrame, className
}) => {
  const connected = connectionState === 'connected';
  const [showConnectionTime, setShowConnectionTime] = useState(false);

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
    <div className={`relative w-full ${className} bg-black`}>
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
        <div className={`absolute bottom-5 left-1/2 z-10 -translate-x-1/2 select-none rounded bg-black/50 px-2 py-0.5 text-sm leading-4 text-white/70 pointer-events-none transition-opacity duration-500 ease-out ${showConnectionTime ? 'opacity-100' : 'opacity-0'}`}>
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
