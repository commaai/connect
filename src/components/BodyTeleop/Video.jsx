import React from 'react';
import { Button } from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import InfoOutline from '@material-ui/icons/InfoOutline';


const ConnectOverlay = ({ connectionState, error, statusMessage, connectProgress, onConnect }) => {
  const connecting = connectionState === 'connecting';
  const failed = connectionState === 'failed';

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        {connecting ? (
          <>
            <div className="w-60 h-1 rounded bg-white/10 overflow-hidden">
              <div
                className="h-full rounded bg-white/70 transition-[width] duration-400 ease-in-out"
                style={{ width: `${connectProgress || 0}%` }}
              />
            </div>
            <span className="text-xs text-white/50">{statusMessage || 'Connecting...'}</span>
          </>
        ) : failed ? (
          <Button
            className="flex items-center gap-2 rounded-3xl px-6 py-2.5 text-white text-sm font-medium normal-case bg-red-600/60 hover:bg-red-600/70 cursor-pointer"
            onClick={onConnect}
            disableRipple
          >
            <Refresh style={{ fontSize: 20 }} />
            Retry
          </Button>
        ) : null}
        {error && (
          <div className={`max-w-[280px] rounded-lg px-3 py-1.5 text-center text-xs text-[#fca5a5] !bg-[rgba(220,38,38,0.4)]`}>
            {error}
          </div>
        )}
        {!connecting && (
          <div className={`flex items-center gap-2.5 rounded-[20px] px-3 py-1.5 text-xs text-white/50`}>
            <InfoOutline style={{ fontSize: 16 }} />
            <span>Body must be powered on and started.</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Video = ({
  videoRef, connectionState, error, statusMessage,
  connectProgress, onConnect,
}) => {
  const connected = connectionState === 'connected';

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
      {!connected && (
        <ConnectOverlay
          connectionState={connectionState}
          error={error}
          statusMessage={statusMessage}
          connectProgress={connectProgress}
          onConnect={onConnect}
        />
      )}
    </>
  );
};

export default Video;
