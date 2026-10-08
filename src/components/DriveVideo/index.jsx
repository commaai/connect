import React, { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import { ErrorOutline, PlayArrow } from '../../icons';
import { attachVideo, currentOffset, isPastVideoEnd, moveTo, pendingVideoTime } from '../../timeline';
import { pause, play, playbackRateChanged, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser';
import Controls from './Controls';
import { openStream } from './stream';

// iPhones stall above 2× and are slow to change to rates below 0.5×
const SPEEDS = isIos() ? [0.5, 1, 2] : [0.1, 0.25, 0.5, 1, 2, 4, 8];
const FRAME = 50; // ms, qcamera records at 20 fps
const canFullscreen = typeof document !== 'undefined' && (document.fullscreenEnabled
  || (typeof HTMLVideoElement !== 'undefined' && 'webkitEnterFullscreen' in HTMLVideoElement.prototype));

// value, once it has been true for ms; false as soon as it isn't
function useDelayed(value, ms) {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!value) {
      setDelayed(false);
      return undefined;
    }
    const timer = setTimeout(() => setDelayed(true), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return delayed;
}

// The drive's video, with the map shown over it when it is a child. The <video> is the
// playback clock: what it does is reported to the store, and controls act on it.
// It renders again on every seek, which may put the playhead past the end of the video.
const DriveVideo = ({ dispatch, currentRoute, loop, isPlaying, playbackRate, children }) => {
  const box = useRef(null);
  const videoRef = useRef(null);
  const hideControls = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(true);
  const [isFullscreen, setFullscreen] = useState(false);
  const showSpinner = useDelayed(waiting && isPlaying && !error, 500);

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;
  const videoStart = currentRoute?.videoStartOffset || 0;

  useEffect(() => {
    attachVideo(videoRef.current, videoStart);
  }, [videoStart]);

  useEffect(() => {
    dispatch(playbackRateChanged(videoRef.current.playbackRate));
    return () => {
      attachVideo(null);
      dispatch(pause());
    };
  }, [dispatch]);

  // a drive plays from the start of its range
  useEffect(() => {
    moveTo(loop?.startTime ?? 0);
  }, [src]);

  useEffect(() => {
    if (!src) {
      return undefined;
    }
    const video = videoRef.current;
    setError(null);
    setWaiting(false);
    setBlocked(false);
    setHasAudio(false);
    return openStream(video, src, {
      startTime: pendingVideoTime(),
      onAttached: () => video.play().catch((err) => setBlocked(err.name === 'NotAllowedError')),
      onAudio: setHasAudio,
      onError: (message) => {
        video.pause();
        setError(message);
      },
    });
  }, [src, attempt]);

  const retry = useCallback(() => {
    moveTo(currentOffset());
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error, retry]);

  // playback stays inside the selected range, and starts over at its end
  const keepInLoop = useCallback(() => {
    const offset = currentOffset();
    const end = loop && loop.startTime + loop.duration;
    if (loop && end > videoStart && (offset < loop.startTime - FRAME || offset >= end)) {
      moveTo(loop.startTime);
    }
  }, [loop, videoStart]);

  const onTimeUpdate = () => {
    if (videoRef.current.readyState >= 3) {
      setWaiting(false);
    }
    keepInLoop();
  };

  const onEnded = () => {
    if (!isPastVideoEnd()) {
      moveTo(loop?.startTime ?? 0);
      videoRef.current.play().catch(() => {});
    }
  };
  useEffect(keepInLoop, [keepInLoop]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const skip = useCallback((ms) => dispatch(seek(currentOffset() + ms)), [dispatch]);

  const step = useCallback((frames) => {
    videoRef.current.pause();
    skip(frames * FRAME);
  }, [skip]);

  const setSpeed = useCallback((speed) => {
    const video = videoRef.current;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  }, []);

  const changeSpeed = useCallback((steps) => {
    const index = SPEEDS.indexOf(videoRef.current.playbackRate);
    setSpeed(SPEEDS[Math.min(Math.max((index === -1 ? SPEEDS.indexOf(1) : index) + steps, 0), SPEEDS.length - 1)]);
  }, [setSpeed]);

  const toggleMute = useCallback(() => {
    videoRef.current.muted = !videoRef.current.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (box.current.requestFullscreen) {
      box.current.requestFullscreen();
    } else {
      videoRef.current.webkitEnterFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const wake = useCallback(() => {
    setActive(true);
    clearTimeout(hideControls.current);
    hideControls.current = setTimeout(() => setActive(false), 3000);
  }, []);
  useEffect(() => () => clearTimeout(hideControls.current), []);

  useEffect(() => {
    const keys = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => skip(-5000),
      ArrowRight: () => skip(5000),
      j: () => skip(-10000),
      l: () => skip(10000),
      ',': () => step(-1),
      '.': () => step(1),
      '<': () => changeSpeed(-1),
      '>': () => changeSpeed(1),
      m: toggleMute,
      f: toggleFullscreen,
    };
    const onKeyDown = (ev) => {
      const action = keys[ev.key];
      const { target } = ev;
      if (!action || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey
        || target.closest?.('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')
        || (ev.key === ' ' && target.closest?.('button') && !box.current?.contains(target))) {
        return;
      }
      ev.preventDefault();
      action();
      wake();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, skip, step, changeSpeed, toggleMute, toggleFullscreen, wake]);

  // a click plays and pauses; a tap shows the controls first, as on a phone's own player
  const onPointerUp = (ev) => {
    if (ev.button !== 0 || ev.target.closest('button')) {
      return;
    }
    if (ev.pointerType === 'mouse') {
      togglePlay();
    } else if (active && isPlaying) {
      setActive(false);
    } else {
      wake();
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (Math.abs(video.currentTime - pendingVideoTime()) > FRAME / 1000) {
      video.currentTime = pendingVideoTime();
    }
    if (video.audioTracks?.length) {
      setHasAudio(true);
    }
  };

  const pastEnd = isPastVideoEnd();
  let status = null;
  if (error) {
    status = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button type="button" className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20" onClick={retry}>
          Try again
        </button>
      </>
    );
  } else if (pastEnd) {
    status = <Typography>The video of this part of the drive has not uploaded yet.</Typography>;
  } else if (showSpinner) {
    status = <CircularProgress className="text-white" thickness={4} size={50} />;
  } else if (blocked && !isPlaying) {
    status = (
      <button type="button" className="rounded-full bg-black/50 p-4 hover:bg-black/70" onClick={togglePlay} aria-label="Play">
        <PlayArrow className="h-10 w-10" />
      </button>
    );
  }

  return (
    <div
      ref={box}
      className={`relative mx-auto aspect-[1.593] w-full max-w-[964px] overflow-hidden bg-black select-none ${children ? 'min-h-[300px]' : 'min-h-[200px]'}`}
      onPointerMove={wake}
      onPointerLeave={(ev) => ev.pointerType === 'mouse' && isPlaying && setActive(false)}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        muted
        playsInline
        preload="auto"
        onPlay={() => { setBlocked(false); wake(); dispatch(play()); }}
        onPause={() => dispatch(pause())}
        onRateChange={() => dispatch(playbackRateChanged(videoRef.current.playbackRate))}
        onVolumeChange={() => setMuted(videoRef.current.muted)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onSeeked={() => setWaiting(false)}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
      />
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-4 text-center ${error || pastEnd ? 'bg-black/70' : ''}`}
        onPointerUp={onPointerUp}
        onDoubleClick={toggleFullscreen}
      >
        {!children && status}
      </div>
      {children && <div className="absolute inset-0 z-10 bg-[#1D2225]">{children}</div>}
      {currentRoute && (
        <Controls
          container={box.current}
          route={currentRoute}
          loop={loop}
          visible={active || !isPlaying || Boolean(children)}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          speeds={SPEEDS}
          muted={muted}
          hasAudio={hasAudio}
          isFullscreen={isFullscreen}
          canFullscreen={canFullscreen}
          onTogglePlay={togglePlay}
          onSkip={skip}
          onSeek={(offset) => dispatch(seek(offset))}
          onSpeed={setSpeed}
          onToggleMute={toggleMute}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
  isPlaying: state.isPlaying,
  playbackRate: state.playbackRate,
  offset: state.offset,
});

export default connect(stateToProps)(DriveVideo);
