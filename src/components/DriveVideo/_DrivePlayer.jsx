import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { CircularProgress, Typography } from '@material-ui/core';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { getVideo } from '../../timeline/_video';
import { seekToRouteMs, toRouteMs } from '../../timeline/_routeTime';
import { useVideoEvent, useVideoFrame, useVideoStatus } from './_hooks';
import Video from './_Video';

const FILL = { width: '100%', height: '100%' };
const SPINNER_STYLE = { color: Colors.white };

const ERROR_MESSAGES = {
  'not-found': 'This video segment has not uploaded yet or has been deleted.',
  network: 'Unable to load video. Check network connection.',
  unsupported: 'Unable to load video',
  media: 'Unable to load video',
};

function playIgnoringInterruptions(video) {
  video.play().catch(() => {});
}

function OverlayContent({ error }) {
  if (!error) {
    return <CircularProgress style={SPINNER_STYLE} thickness={4} size={50} />;
  }
  return (
    <>
      <ErrorOutline className="mb-2" />
      <Typography>{error}</Typography>
    </>
  );
}

function VideoOverlay({ loading, error }) {
  if (!error && !loading) {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        <OverlayContent error={error} />
      </div>
    </div>
  );
}

function usePlaybackError(src) {
  const [failedSrc, setFailedSrc] = useState(null);
  const [errorKind, setErrorKind] = useState(null);

  const handleError = useCallback(({ kind }) => {
    setFailedSrc(src);
    setErrorKind(kind);
  }, [src]);

  const clearError = useCallback(() => setFailedSrc(null), []);
  useVideoEvent('playing', clearError);

  const currentSourceFailed = failedSrc !== null && failedSrc === src;
  if (!currentSourceFailed) {
    return { error: null, handleError };
  }
  return { error: ERROR_MESSAGES[errorKind], handleError };
}

function useRestartOnLoopChange(route, loopStart, loopDuration) {
  useEffect(() => {
    const video = getVideo();
    if (!video) {
      return;
    }

    const hasMetadata = video.readyState >= video.HAVE_METADATA;
    if (!hasMetadata) {
      return;
    }

    seekToRouteMs(video, route, loopStart);
    video.playbackRate = 1;
    playIgnoringInterruptions(video);
  }, [loopStart, loopDuration]);
}

function useLoopWrap(route, loopStart, loopDuration) {
  const wrapPastLoopEnd = useCallback((videoSeconds) => {
    if (!loopDuration) {
      return;
    }

    const loopEnd = loopStart + loopDuration;
    const isPastLoopEnd = toRouteMs(route, videoSeconds) >= loopEnd;
    if (!isPastLoopEnd) {
      return;
    }

    seekToRouteMs(getVideo(), route, loopStart);
  }, [route, loopStart, loopDuration]);

  const replayLoop = useCallback(() => {
    if (!loopDuration) {
      return;
    }

    const video = getVideo();
    seekToRouteMs(video, route, loopStart);
    playIgnoringInterruptions(video);
  }, [route, loopStart, loopDuration]);

  useVideoFrame(wrapPastLoopEnd);
  useVideoEvent('ended', replayLoop);
}

const DrivePlayer = forwardRef(function DrivePlayer({ src, route, loop, ...props }, ref) {
  const loopStart = loop?.startTime;
  const loopDuration = loop?.duration;

  const { buffering } = useVideoStatus();
  const { error, handleError } = usePlaybackError(src);
  useRestartOnLoopChange(route, loopStart, loopDuration);
  useLoopWrap(route, loopStart, loopDuration);

  useImperativeHandle(ref, () => ({
    seek(routeMs) {
      const video = getVideo();
      if (!video) {
        return;
      }
      seekToRouteMs(video, route, routeMs, loop);
    },
  }), [route, loop]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={buffering} error={error} />
      <div style={FILL}>
        <Video src={src} onError={handleError} autoPlay muted style={FILL} {...props} />
      </div>
    </div>
  );
});

export default DrivePlayer;
