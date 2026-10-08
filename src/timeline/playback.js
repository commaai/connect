// Playback is driven by the video element, not by a parallel clock in the
// store. User intent (play, pause, seek, speed) is applied directly to the
// element and the element's own events flow back into the store. Consumers
// that need a smooth playhead (timeline, map, time display) read
// getPlayheadMs(), which interpolates between the element's timeupdate
// events rather than maintaining an offset that the video is then forced to
// match. When no video is attached (the map-only view), the playhead keeps
// advancing from the last known position at the current speed.

import * as Types from '../actions/types';

// ignore sub-250ms differences when syncing the element to the playhead
const SEEK_SYNC_TOLERANCE_MS = 250;

let store = null;
let video = null;
let listeners = null;
let anchor = null; // { offsetMs, wallMs, rate, advancing }

// this module is imported by the root reducer, so importing the store here
// would create a module cycle; the store registers itself once created
export function setStore(createdStore) {
  store = createdStore;
}

function dispatch(action) {
  store.dispatch(action);
}

function videoStartOffsetMs() {
  // the stream starts at the first road camera frame, which can sit a few
  // seconds into the route timeline
  return store.getState().currentRoute?.videoStartOffset ?? 0;
}

function loopBounds() {
  const { loop } = store.getState();
  if (!loop || loop.startTime == null || !(loop.duration > 0)) {
    return null;
  }
  return loop;
}

function clampToLoop(offsetMs) {
  const loop = loopBounds();
  if (!loop) {
    return offsetMs;
  }
  return Math.min(Math.max(offsetMs, loop.startTime), loop.startTime + loop.duration);
}

function videoTimeToOffsetMs(seconds) {
  return (seconds * 1000) + videoStartOffsetMs();
}

function offsetMsToVideoTime(offsetMs) {
  return Math.max(0, (offsetMs - videoStartOffsetMs()) / 1000);
}

function loopStartMs() {
  const loop = loopBounds();
  if (!loop) {
    return 0;
  }
  // the stream has no data before its first frame, so a loop covering the
  // start of the route begins there
  return Math.max(loop.startTime, Math.min(videoStartOffsetMs(), loop.startTime + loop.duration));
}

function reanchor(offsetMs, advancing) {
  anchor = {
    offsetMs,
    wallMs: performance.now(),
    rate: video ? video.playbackRate : store.getState().playback.speed,
    advancing,
  };
}

export function getPlayheadMs() {
  const state = store.getState();
  let offsetMs;
  if (anchor) {
    offsetMs = anchor.offsetMs;
    if (anchor.advancing && !state.playback.buffering) {
      offsetMs += (performance.now() - anchor.wallMs) * anchor.rate;
    }
  } else {
    offsetMs = state.loop?.startTime ?? state.zoom?.start ?? 0;
  }

  const loop = loopBounds();
  if (loop) {
    if (offsetMs < loop.startTime) {
      offsetMs = loop.startTime;
    } else if (offsetMs > loop.startTime + loop.duration) {
      offsetMs = ((offsetMs - loop.startTime) % loop.duration) + loop.startTime;
    }
  }
  return offsetMs;
}

// seek within the current loop, or anywhere in the route when there is none
export function seek(offsetMs) {
  const targetMs = clampToLoop(offsetMs);
  // the element keeps its own play state across a seek; the waiting event
  // freezes interpolation if the seek target still needs to be downloaded
  reanchor(targetMs, video ? !video.paused : store.getState().playback.playing);
  if (video && video.readyState >= 1) {
    video.currentTime = offsetMsToVideoTime(targetMs);
    // else: loadedmetadata syncs the element to the playhead
  }
  dispatch({ type: Types.ACTION_SEEK, offset: targetMs });
}

export function play() {
  if (video) {
    const playing = video.play();
    playing?.catch?.((err) => {
      // pause() during startup rejects with AbortError; anything else means
      // autoplay was blocked or the element cannot play
      if (err?.name !== 'AbortError') {
        console.error('Could not play video', err);
      }
    });
  } else {
    reanchor(getPlayheadMs(), true);
    dispatch({ type: Types.ACTION_PLAY });
  }
}

export function pause() {
  if (video) {
    if (!video.paused) {
      video.pause();
    }
  } else {
    reanchor(getPlayheadMs(), false);
    dispatch({ type: Types.ACTION_PAUSE });
  }
}

export function setSpeed(speed) {
  if (video) {
    video.playbackRate = speed; // ratechange follows
  } else {
    dispatch({ type: Types.ACTION_PLAYBACK_RATE, speed });
    reanchor(getPlayheadMs(), store.getState().playback.playing);
  }
}

// select the playhead loop and restart playback inside it, the way selecting
// a timeline range has always behaved
export function applyLoop(start, end) {
  dispatch({ type: Types.ACTION_LOOP, start, end });
  setSpeed(1);
  seek(start ?? 0);
  play();
}

function enforceLoop() {
  const loop = loopBounds();
  if (!loop || !video) {
    return;
  }
  if (videoTimeToOffsetMs(video.currentTime) >= loop.startTime + loop.duration) {
    seek(loopStartMs());
  }
}

function onTimeupdate() {
  reanchor(videoTimeToOffsetMs(video.currentTime), !video.paused);
  enforceLoop();
}

function onPlay() {
  reanchor(videoTimeToOffsetMs(video.currentTime), true);
  dispatch({ type: Types.ACTION_PLAY });
}

function onPause() {
  reanchor(videoTimeToOffsetMs(video.currentTime), false);
  dispatch({ type: Types.ACTION_PAUSE });
}

function onEnded() {
  reanchor(videoTimeToOffsetMs(video.currentTime), false);
  if (loopBounds()) {
    seek(loopStartMs());
    play();
  } else {
    dispatch({ type: Types.ACTION_PAUSE });
  }
}

function onRateChange() {
  const offsetMs = getPlayheadMs();
  anchor = {
    offsetMs,
    wallMs: performance.now(),
    rate: video.playbackRate,
    advancing: anchor?.advancing ?? false,
  };
  dispatch({ type: Types.ACTION_PLAYBACK_RATE, speed: video.playbackRate });
}

function onLoadedMetadata() {
  // sync the element to the current playhead once its duration is known
  const targetMs = getPlayheadMs();
  if (Math.abs(videoTimeToOffsetMs(video.currentTime) - targetMs) > SEEK_SYNC_TOLERANCE_MS) {
    video.currentTime = offsetMsToVideoTime(targetMs);
  }
  if (store.getState().playback.playing) {
    play();
  }
}

const buffer = (buffering) => () => {
  // freeze the playhead where the element actually stalled, and resume
  // interpolation from there once it recovers, so the playhead never runs
  // ahead of or behind the element across a stall
  reanchor(getPlayheadMs(), buffering ? false : (video ? !video.paused : store.getState().playback.playing));
  dispatch({ type: Types.ACTION_BUFFER_VIDEO, buffering });
};

function onSeeked() {
  reanchor(videoTimeToOffsetMs(video.currentTime), !video.paused);
  dispatch({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
}

function onError() {
  markUnplayable();
}

// the stream cannot play (fatal error); stop playback where it died
export function markUnplayable() {
  if (video) {
    reanchor(videoTimeToOffsetMs(video.currentTime), false);
  } else {
    reanchor(getPlayheadMs(), false);
  }
  dispatch({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
  dispatch({ type: Types.ACTION_PAUSE });
}

export function attachVideo(element) {
  detachVideo();
  video = element;
  listeners = [
    ['timeupdate', onTimeupdate],
    ['play', onPlay],
    ['pause', onPause],
    ['ended', onEnded],
    ['ratechange', onRateChange],
    ['waiting', buffer(true)],
    ['stalled', buffer(true)],
    ['playing', buffer(false)],
    ['canplay', buffer(false)],
    ['seeked', onSeeked],
    ['loadedmetadata', onLoadedMetadata],
    ['error', onError],
  ];
  for (const [name, handler] of listeners) {
    video.addEventListener(name, handler);
  }
}

export function detachVideo() {
  if (!video) {
    return;
  }
  if (listeners) {
    for (const [name, handler] of listeners) {
      video.removeEventListener(name, handler);
    }
    listeners = null;
  }
  video = null;
  // without an element there is nothing to wait for, so the playhead should
  // keep moving if it was playing
  if (store.getState().playback.buffering) {
    dispatch({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
  }
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_PLAY:
      if (state.playback.playing) {
        return state;
      }
      return { ...state, playback: { ...state.playback, playing: true } };
    case Types.ACTION_PAUSE:
      if (!state.playback.playing) {
        return state;
      }
      return { ...state, playback: { ...state.playback, playing: false } };
    case Types.ACTION_BUFFER_VIDEO:
      if (state.playback.buffering === action.buffering) {
        return state;
      }
      return { ...state, playback: { ...state.playback, buffering: action.buffering } };
    case Types.ACTION_PLAYBACK_RATE:
      if (state.playback.speed === action.speed) {
        return state;
      }
      return { ...state, playback: { ...state.playback, speed: action.speed } };
    case Types.ACTION_LOOP: {
      const hasLoop = action.start != null && action.end != null;
      const loop = hasLoop ? { startTime: action.start, duration: action.end - action.start } : null;
      if (loop && state.loop?.startTime === loop.startTime && state.loop?.duration === loop.duration) {
        return state;
      }
      if (!loop && !state.loop) {
        return state;
      }
      return { ...state, loop };
    }
    default:
      return state;
  }
}
