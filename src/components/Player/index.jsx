import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { connect } from 'react-redux';
import Hls from 'hls.js';
import dayjs from 'dayjs';
import { Tooltip } from '@material-ui/core';

import { api } from '../../api/backend';
import {
  ErrorOutline, Forward10, Fullscreen, FullscreenExit, Pause, PlayArrow, Replay10, VolumeOff, VolumeUp,
} from '../../icons';
import { currentOffset } from '../../timeline';
import {
  attachPlayer, bufferedAhead, isLoading, isPlaying, pause, play, playbackBounds, playStart,
  resumesOnline, seek, startPosition, stopAt, visibleError,
} from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';

const PlayerContext = createContext(null);

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) {
    throw new Error('usePlayer must be used inside Player.Provider');
  }
  return player;
}

const MEDIA_EVENTS = [
  'play', 'pause', 'playing', 'waiting', 'seeking', 'seeked', 'timeupdate', 'progress',
  'canplay', 'emptied', 'loadedmetadata', 'ratechange', 'volumechange',
];

const ERROR_TEXT = {
  missing: 'This video segment has not uploaded yet or has been deleted.',
  network: 'Unable to load video. Check network connection.',
  media: 'Unable to play this video.',
};

// below HAVE_FUTURE_DATA the engine cannot play at the playhead even when
// `buffered` covers it (WebKit, empty playback buffer), so that range doesn't count
function snapshot(video, err) {
  const t = video.currentTime;
  const hasFutureData = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const buffered = [];
  for (let i = 0; i < video.buffered.length; i++) {
    const [start, end] = [video.buffered.start(i), video.buffered.end(i)];
    if (hasFutureData || !(start <= t && t < end)) {
      buffered.push([start * 1000, end * 1000]);
    }
  }
  return { currentTime: t * 1000, paused: video.paused, seeking: video.seeking, buffered, err };
}

const MEDIA_RECOVERY_MS = 5000;

// a blocked or interrupted play() leaves the element paused, which the play
// button already shows; jsdom returns no promise
const playVideo = (video) => video.play()?.catch(() => {});

// hls.js runs on MediaSource, or ManagedMediaSource on iPhone (iOS 17.1+).
// Without it, Safari's own HLS freezes above 2x: the stream has no I-frame playlist.
const HLS_JS = Hls.isSupported();
const ALL_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8];
const SPEEDS = HLS_JS ? ALL_SPEEDS : ALL_SPEEDS.filter((step) => step <= 2);

function PlayerProvider({ children, currentRoute, loop, zoom, dispatch }) {
  const [video, setVideo] = useState(null);
  const [err, setErr] = useState('');
  const [, refresh] = useReducer((n) => n + 1, 0);
  const [muted, setMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const hlsRef = useRef(null);
  const frameRef = useRef(null);
  const errRef = useRef(err);
  const fatalRef = useRef('');
  const startAtRef = useRef(null);
  const [reloadKey, reload] = useReducer((n) => n + 1, 0);
  errRef.current = err;

  const bounds = playbackBounds({ currentRoute, loop, zoom }, video);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;

  // play(), never the autoplay attribute: iOS pauses autoplay videos while hidden
  useEffect(() => {
    if (!video || !src) {
      return undefined;
    }
    setErr('');
    setHasAudio(false);
    const startSec = startAtRef.current ?? startPosition(boundsRef.current) / 1000;
    startAtRef.current = null;
    let hls = null;
    let lastMediaRecovery = 0;
    if (HLS_JS) {
      hls = new Hls({ maxBufferLength: 40, startPosition: startSec });
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => setHasAudio(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return; // hls.js retries these itself
        }
        fatalRef.current = data.type;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && Date.now() - lastMediaRecovery > MEDIA_RECOVERY_MS) {
          lastMediaRecovery = Date.now();
          hls.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setErr('media');
        } else {
          setErr(data.response?.code === 404 ? 'missing' : 'network');
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }
    // hls.js loads from here once fragments are tracked
    video.currentTime = startSec;
    hlsRef.current = hls;
    playVideo(video);

    return () => {
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [video, src, reloadKey]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!video) {
      return undefined;
    }

    const recover = (sec) => {
      setErr('');
      video.currentTime = sec;
      const hls = hlsRef.current;
      const fatal = fatalRef.current;
      fatalRef.current = '';
      if (hls && fatal === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else if (hls?.levels?.length) {
        hls.startLoad(sec);
      } else if (hls) {
        // startLoad() does nothing until a manifest has loaded: start a new hls.js at sec
        startAtRef.current = sec;
        reload();
      } else {
        const resume = !video.paused;
        video.load();
        video.currentTime = sec;
        if (resume) {
          playVideo(video);
        }
      }
    };

    const onMedia = () => refresh();
    const onTimeUpdate = () => {
      const stop = stopAt(snapshot(video, errRef.current), boundsRef.current);
      if (stop !== null) {
        video.pause();
        video.currentTime = stop / 1000;
      }
    };
    const onPlay = () => {
      const start = playStart(snapshot(video, errRef.current), boundsRef.current);
      if (start !== null) {
        video.currentTime = start / 1000;
      }
    };
    const onNativeError = () => {
      if (!hlsRef.current) {
        // native HLS reports a missing playlist or segment as SRC_NOT_SUPPORTED
        setErr(video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'missing' : 'network');
      }
    };
    const onLoadedMetadata = () => {
      if (!hlsRef.current && video.audioTracks) {
        setHasAudio(video.audioTracks.length > 0);
      }
    };
    // Chrome pauses muted video in hidden pages and never resumes it
    let pausedWhileHidden = false;
    const onPause = () => {
      pausedWhileHidden = document.hidden;
    };
    const onVisibility = () => {
      if (!document.hidden && pausedWhileHidden) {
        pausedWhileHidden = false;
        playVideo(video);
      }
    };
    const onOnline = () => {
      if (resumesOnline(snapshot(video, errRef.current), navigator.onLine)) {
        recover(video.currentTime);
      }
    };

    MEDIA_EVENTS.forEach((type) => video.addEventListener(type, onMedia));
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('error', onNativeError);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('pause', onPause);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const detach = attachPlayer({
      video,
      seekTo: (ms) => {
        if (errRef.current) {
          recover(ms / 1000);
        } else {
          video.currentTime = ms / 1000;
        }
      },
      play: () => playVideo(video),
    });

    return () => {
      detach();
      MEDIA_EVENTS.forEach((type) => video.removeEventListener(type, onMedia));
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('error', onNativeError);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('pause', onPause);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [video]);

  const el = video ? snapshot(video, err) : null;
  const playing = el ? isPlaying(el) : false;
  const showSpinner = el ? isLoading(el, bounds) : Boolean(src);
  const error = el ? visibleError(el) : '';

  const bufferedTo = el ? el.currentTime + bufferedAhead(el) + bounds.videoStart : bounds.loopStart;

  const value = useMemo(() => ({
    state: {
      playing, spinner: showSpinner, error: error ? ERROR_TEXT[error] : '', muted, hasAudio, speed, fullscreen,
      loopStart: bounds.loopStart, loopEnd: bounds.loopEnd, bufferedTo,
    },
    actions: {
      togglePlay: () => dispatch(playing ? pause() : play()),
      seek: (offset) => dispatch(seek(offset)),
      jump: (ms) => dispatch(seek(currentOffset() + ms)),
      setSpeed: (next) => {
        if (video) {
          video.playbackRate = next;
          video.defaultPlaybackRate = next;
        }
        setSpeed(next);
      },
      // must run inside the click: unmuting outside a user gesture pauses on iOS
      toggleMute: () => {
        if (video) {
          video.muted = !muted;
        }
        setMuted(!muted);
      },
      // iPhone can only fullscreen the <video> itself
      toggleFullscreen: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (frameRef.current?.requestFullscreen) {
          frameRef.current.requestFullscreen();
        } else {
          video?.webkitEnterFullscreen?.();
        }
      },
    },
    meta: { videoRef: setVideo, frameRef },
  }), [playing, showSpinner, error, muted, hasAudio, speed, fullscreen, bounds.loopStart, bounds.loopEnd, bufferedTo, video, dispatch]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

const IDLE_MS = 2500;

const iconButton = 'flex size-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors '
  + 'hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70 '
  + 'aria-disabled:cursor-default aria-disabled:bg-transparent aria-disabled:text-white/30';

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function useOffset() {
  const [offset, setOffset] = useState(() => currentOffset());
  useEffect(() => {
    let frame;
    const tick = () => {
      const next = Math.round(currentOffset() / 100) * 100;
      setOffset((prev) => (prev === next ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return offset;
}

const SHORTCUTS = {
  ' ': (actions) => actions.togglePlay(),
  k: (actions) => actions.togglePlay(),
  j: (actions) => actions.jump(-10000),
  l: (actions) => actions.jump(10000),
  ArrowLeft: (actions) => actions.jump(-5000),
  ArrowRight: (actions) => actions.jump(5000),
  m: (actions, state) => state.hasAudio && actions.toggleMute(),
  f: (actions) => actions.toggleFullscreen(),
};

function PlayerFrame({ className = '', children }) {
  const { state, actions, meta } = usePlayer();
  const [active, setActive] = useState(true);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const timer = useRef(null);
  const tapWoke = useRef(false);
  const wake = () => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), IDLE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const latest = useRef(null);
  latest.current = { actions, state, wake };
  useEffect(() => {
    const onKeyDown = (event) => {
      const frame = meta.frameRef.current;
      const shortcut = SHORTCUTS[event.key];
      if (!frame || frame.getClientRects().length === 0 || !shortcut || event.metaKey || event.ctrlKey || event.altKey) {
        return; // offsetParent is null while hidden in map-only view
      }
      const { target } = event;
      const inPlayer = frame.contains(target);
      if (!inPlayer && target !== document.body) {
        return;
      }
      // a focused control keeps Space and its own arrow keys
      const onControl = inPlayer && target !== frame;
      if (onControl && (event.key === ' ' || ['INPUT', 'SELECT'].includes(target.tagName))) {
        return;
      }
      event.preventDefault();
      latest.current.wake();
      shortcut(latest.current.actions, latest.current.state);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [meta.frameRef]);

  const onFocus = (event) => {
    setKeyboardFocus(event.target.matches(':focus-visible'));
    wake();
  };
  const onBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setKeyboardFocus(false);
    }
  };

  // a tap while the controls are hidden only reveals them
  const onPointerDown = (event) => {
    tapWoke.current = event.pointerType === 'touch' && state.playing && !active;
    wake();
  };
  const onClick = (event) => {
    if (event.target.tagName !== 'VIDEO') {
      return;
    }
    if (!tapWoke.current) {
      actions.togglePlay();
    }
    tapWoke.current = false;
  };

  const idle = state.playing && !active && !keyboardFocus;
  return (
    <div
      ref={meta.frameRef}
      role="region"
      aria-label="Drive video"
      tabIndex={0}
      onPointerMove={wake}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      data-idle={idle}
      className={`group relative mx-auto aspect-[1.593] min-h-[200px] w-full max-w-[964px] overflow-hidden rounded-xl bg-black
        focus-visible:outline-2 focus-visible:outline-white/60 ${idle ? 'cursor-none' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function PlayerVideo() {
  const { state, actions, meta } = usePlayer();
  return (
    <video
      ref={meta.videoRef}
      className="size-full"
      muted={state.muted}
      playsInline
      onDoubleClick={actions.toggleFullscreen}
    />
  );
}

function PlayerOverlay() {
  const { state } = usePlayer();
  if (state.error) {
    return (
      <div role="alert" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center">
        <ErrorOutline className="size-8 text-white/80" />
        <p className="text-sm text-white/90">{state.error}</p>
      </div>
    );
  }
  if (!state.spinner) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        role="progressbar"
        aria-label="Loading video"
        className="size-14 rounded-full border-4 border-white/25 border-t-white opacity-100 transition-opacity delay-300 duration-200
          starting:opacity-0 motion-safe:animate-spin"
      />
    </div>
  );
}

function PlayerProgress() {
  const { state, actions } = usePlayer();
  const offset = useOffset();
  const span = Math.max(1, state.loopEnd - state.loopStart);
  const pct = (value) => `${Math.min(100, Math.max(0, ((value - state.loopStart) / span) * 100))}%`;
  return (
    <div className="group/progress relative mx-3 h-6 cursor-pointer">
      <div
        className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20 motion-safe:transition-[height]
          group-hover/progress:h-1.5"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: pct(state.bufferedTo) }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: pct(offset) }} />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white
          motion-safe:transition-transform group-hover/progress:scale-100 group-has-[:focus-visible]/progress:scale-100
          group-has-[:focus-visible]/progress:ring-2 group-has-[:focus-visible]/progress:ring-white/70
          group-has-[:focus-visible]/progress:ring-offset-2 group-has-[:focus-visible]/progress:ring-offset-black"
        style={{ left: pct(offset) }}
      />
      <input
        type="range"
        aria-label="Seek"
        aria-valuetext={`${formatDuration(offset - state.loopStart)} of ${formatDuration(span)}`}
        min={state.loopStart}
        max={state.loopEnd}
        step={1000}
        value={Math.min(state.loopEnd, Math.max(state.loopStart, offset))}
        onChange={(event) => actions.seek(Number(event.target.value))}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function ControlsBar({ currentRoute }) {
  const { state, actions } = usePlayer();
  const offset = useOffset();
  const clock = new Date(offset + (currentRoute?.start_time_utc_millis ?? NaN));
  const clockText = Number.isNaN(clock.getTime()) ? '' : dayjs(clock).format('HH:mm:ss');
  return (
    <div className="flex flex-col gap-1 pb-1">
      <PlayerProgress />
      <div className="flex items-center gap-1 px-2">
        <button type="button" className={iconButton} onClick={actions.togglePlay} aria-label={state.playing ? 'Pause' : 'Play'}>
          {state.playing ? <Pause className="size-7" /> : <PlayArrow className="size-7" />}
        </button>
        {/* hidden below 480px so the row fits 320px; the seek bar and j/l still jump */}
        <button type="button" className={`${iconButton} max-xs:hidden`} onClick={() => actions.jump(-10000)} aria-label="Jump back 10 seconds">
          <Replay10 className="size-6" />
        </button>
        <button type="button" className={`${iconButton} max-xs:hidden`} onClick={() => actions.jump(10000)} aria-label="Jump forward 10 seconds">
          <Forward10 className="size-6" />
        </button>
        <Tooltip title={state.hasAudio ? '' : 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device'}>
          {/* aria-disabled keeps it focusable so keyboard users can reach the tooltip */}
          <button
            type="button"
            className={iconButton}
            onClick={state.hasAudio ? actions.toggleMute : undefined}
            aria-disabled={!state.hasAudio}
            aria-label={state.muted ? 'Unmute' : 'Mute'}
          >
            {state.muted ? <VolumeOff className="size-6" /> : <VolumeUp className="size-6" />}
          </button>
        </Tooltip>
        <div className="ml-2 flex min-w-0 grow items-baseline gap-2 text-sm tabular-nums">
          <span className="text-white">{`${formatDuration(offset - state.loopStart)} / ${formatDuration(state.loopEnd - state.loopStart)}`}</span>
          {clockText && <span className="hidden text-white/60 xs:inline">{clockText}</span>}
          <span className="hidden text-white/60 sm:inline">{`Segment ${getSegmentNumber(currentRoute, offset)}`}</span>
        </div>
        <select
          className="h-8 shrink-0 cursor-pointer appearance-none rounded-full px-3 text-center text-sm font-medium tabular-nums
            text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70"
          value={state.speed}
          onChange={(event) => actions.setSpeed(Number(event.target.value))}
          aria-label="Playback speed"
        >
          {SPEEDS.map((step) => <option key={step} value={step} className="bg-[#1e2224]">{`${step}×`}</option>)}
        </select>
        <button
          type="button"
          className={iconButton}
          onClick={actions.toggleFullscreen}
          aria-label={state.fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {state.fullscreen ? <FullscreenExit className="size-6" /> : <Fullscreen className="size-6" />}
        </button>
      </div>
    </div>
  );
}

const PlayerControlsBar = connect((state) => ({ currentRoute: state.currentRoute }))(ControlsBar);

function PlayerControls() {
  return (
    <div
      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 transition-opacity duration-200
        group-data-[idle=true]:pointer-events-none group-data-[idle=true]:opacity-0"
    >
      <PlayerControlsBar />
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
  zoom: state.zoom,
});

const Player = {
  Provider: connect(stateToProps)(PlayerProvider),
  Frame: PlayerFrame,
  Video: PlayerVideo,
  Overlay: PlayerOverlay,
  Controls: PlayerControls,
};

export default Player;
