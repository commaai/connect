import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { CircularProgress, Typography } from '@material-ui/core';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { getVideo, playIgnoringInterruptions } from '../../timeline/video';
import { seekToRouteMs, toRouteMs } from '../../timeline/routeTime';
import { useVideoBuffering, useVideoEvent, useVideoFrame } from '../../hooks/video';
import Video from './Video';

const FILL = { width: '100%', height: '100%' };
const SPINNER_STYLE = { color: Colors.white };

const ERROR_MESSAGES = {
  'not-found': 'This video segment has not uploaded yet or has been deleted.',
  network: 'Unable to load video. Check network connection.',
  media: 'Unable to load video',
};

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
  const [failure, setFailure] = useState(null);

  const handleError = useCallback(({ kind }) => {
    setFailure((current) => {
      const isSameFailure = current?.src === src && current.kind === kind;
      if (isSameFailure) {
        return current;
      }
      return { src, kind };
    });
  }, [src]);

  const clearError = useCallback(() => setFailure(null), []);
  useVideoEvent('playing', clearError);

  const currentSourceFailed = failure !== null && failure.src === src;
  if (!currentSourceFailed) {
    return { error: null, handleError };
  }
  return { error: ERROR_MESSAGES[failure.kind], handleError };
}

function loopContainsVideo(video, videoStartOffset, loopStart, loopDuration) {
  if (!loopDuration) {
    return false;
  }
  const loopEnd = loopStart + loopDuration;
  const videoStartMs = toRouteMs(videoStartOffset, 0);
  const videoEndMs = toRouteMs(videoStartOffset, video.duration);
  return loopEnd > videoStartMs && loopStart < videoEndMs;
}

function useLoopWrap(videoStartOffset, loopStart, loopDuration) {
  const wrapPastLoopEnd = useCallback((videoSeconds) => {
    const video = getVideo();
    if (!loopContainsVideo(video, videoStartOffset, loopStart, loopDuration)) {
      return;
    }

    const loopEnd = loopStart + loopDuration;
    const isPastLoopEnd = toRouteMs(videoStartOffset, videoSeconds) >= loopEnd;
    if (!isPastLoopEnd) {
      return;
    }

    seekToRouteMs(video, videoStartOffset, loopStart);
  }, [videoStartOffset, loopStart, loopDuration]);

  const replayLoop = useCallback(() => {
    const video = getVideo();
    if (!loopContainsVideo(video, videoStartOffset, loopStart, loopDuration)) {
      return;
    }

    seekToRouteMs(video, videoStartOffset, loopStart);
    playIgnoringInterruptions(video);
  }, [videoStartOffset, loopStart, loopDuration]);

  useVideoFrame(wrapPastLoopEnd);
  useVideoEvent('ended', replayLoop);
}

const DriveVideo = forwardRef(function DriveVideo({ src, route, loop, ...props }, ref) {
  const videoStartOffset = route?.videoStartOffset;
  const loopStart = loop?.startTime;
  const loopDuration = loop?.duration;

  const buffering = useVideoBuffering();
  const { error, handleError } = usePlaybackError(src);
  useLoopWrap(videoStartOffset, loopStart, loopDuration);

  useImperativeHandle(ref, () => ({
    restart() {
      const video = getVideo();
      if (!video) {
        return;
      }
      seekToRouteMs(video, videoStartOffset, loopStart ?? 0);
      video.playbackRate = 1;
      playIgnoringInterruptions(video);
    },
  }), [videoStartOffset, loopStart]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={buffering} error={error} />
      <div style={FILL}>
        <Video src={src} onError={handleError} autoPlay muted style={FILL} {...props} />
      </div>
    </div>
  );
});

export default DriveVideo;
