import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { getVideo, playIgnoringInterruptions, setPlaybackRate } from '../../timeline/video';
import { seekToRouteMs, toRouteMs, toVideoSeconds } from '../../timeline/routeTime';
import { useVideoBuffering, useVideoEvent, useVideoFrame } from '../../hooks/video';
import Video from './Video';

const SPINNER_STYLE = { color: Colors.white };
const SEEK_PRECISION_MS = 1;

const ERROR_MESSAGES = {
  'not-found': 'This video segment has not uploaded yet or has been deleted.',
  network: 'Unable to load video. Check network connection.',
  media: 'Unable to load video',
};

const RetryButton = ({ onRetry }) => {
  if (!onRetry) return null;
  return (
    <Button onClick={onRetry} className="mt-3 rounded-[15px] bg-white/10 px-6 py-1.5 normal-case text-white hover:bg-white/20">
      Retry
    </Button>
  );
};

const OverlayContent = ({ error, onRetry }) => {
  if (!error) return <CircularProgress style={SPINNER_STYLE} thickness={4} size={50} />;
  return (
    <>
      <ErrorOutline className="mb-2" />
      <Typography>{error}</Typography>
      <RetryButton onRetry={onRetry} />
    </>
  );
};

const VideoOverlay = ({ loading, error, onRetry }) => {
  const hasNothingToShow = !error && !loading;
  if (hasNothingToShow) return null;
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        <OverlayContent error={error} onRetry={onRetry} />
      </div>
    </div>
  );
};

function usePlaybackError(src) {
  const [failure, setFailure] = useState(null);

  const handleError = useCallback(({ kind, retry }) => {
    setFailure((current) => {
      const isSameFailure = current?.src === src && current.kind === kind;
      const gainsRetry = !current?.retry && Boolean(retry);
      if (isSameFailure && !gainsRetry) return current;
      return { src, kind, retry };
    });
  }, [src]);

  const handlePlaying = useCallback(() => setFailure(null), []);
  useVideoEvent('playing', handlePlaying);

  const hasCurrentSourceFailed = failure !== null && failure.src === src;
  if (!hasCurrentSourceFailed) return { error: null, handleError };
  if (!failure.retry) return { error: ERROR_MESSAGES[failure.kind], handleError };

  const retry = () => {
    setFailure(null);
    failure.retry();
  };
  return { error: ERROR_MESSAGES[failure.kind], retry, handleError };
}

function loopContainsVideo(video, videoStartOffset, loopStart, loopDuration) {
  if (!video) return false;
  if (!loopDuration) return false;
  const loopEnd = loopStart + loopDuration;
  const videoStartMs = toRouteMs(videoStartOffset, 0);
  const videoEndMs = toRouteMs(videoStartOffset, video.duration);
  return loopEnd > videoStartMs && loopStart < videoEndMs;
}

function useLoopBounds(videoStartOffset, loopStart, loopDuration) {
  const handleFrame = useCallback((videoSeconds) => {
    const video = getVideo();
    if (!loopContainsVideo(video, videoStartOffset, loopStart, loopDuration)) return;
    if (video.readyState < video.HAVE_FUTURE_DATA) return;

    const routeMs = toRouteMs(videoStartOffset, videoSeconds);
    const loopEnd = loopStart + loopDuration;
    const isOutsideLoop = routeMs < loopStart - SEEK_PRECISION_MS || routeMs >= loopEnd;
    if (!isOutsideLoop) return;

    seekToRouteMs(video, videoStartOffset, loopStart);
  }, [videoStartOffset, loopStart, loopDuration]);

  const handleEnded = useCallback(() => {
    const video = getVideo();
    if (!loopContainsVideo(video, videoStartOffset, loopStart, loopDuration)) return;

    seekToRouteMs(video, videoStartOffset, loopStart);
    playIgnoringInterruptions(video);
  }, [videoStartOffset, loopStart, loopDuration]);

  useVideoFrame(handleFrame);
  useVideoEvent('ended', handleEnded);
}

function useStartPosition(startPosition) {
  const previousStartRef = useRef(startPosition);

  useEffect(() => {
    const previousStart = previousStartRef.current;
    previousStartRef.current = startPosition;
    const video = getVideo();
    const isStillAtPreviousStart = video?.currentTime === previousStart;
    if (!isStillAtPreviousStart) return;
    video.currentTime = startPosition;
  }, [startPosition]);
}

const DriveVideo = forwardRef(function DriveVideo({ src, route, loop, ...props }, ref) {
  const videoStartOffset = route?.videoStartOffset;
  const loopStart = loop?.startTime;
  const loopDuration = loop?.duration;
  const startPosition = toVideoSeconds(videoStartOffset, loopStart ?? 0);

  const buffering = useVideoBuffering();
  const { error, retry, handleError } = usePlaybackError(src);
  useLoopBounds(videoStartOffset, loopStart, loopDuration);
  useStartPosition(startPosition);

  useImperativeHandle(ref, () => ({
    restart() {
      const video = getVideo();
      if (!video) return;
      seekToRouteMs(video, videoStartOffset, loopStart ?? 0);
      setPlaybackRate(video, 1);
      playIgnoringInterruptions(video);
    },
  }), [videoStartOffset, loopStart]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={buffering} error={error} onRetry={retry} />
      <div className="w-full h-full">
        <Video
          src={src}
          startPosition={startPosition}
          onError={handleError}
          autoPlay
          muted
          className="w-full h-full"
          {...props}
        />
      </div>
    </div>
  );
});

export default DriveVideo;
