import * as Types from '../actions/types';

export function reducer(state, action) {
  let next = state;
  if (action.type === Types.ACTION_LOOP) {
    const hasRange = action.start !== null && action.start !== undefined
      && action.end !== null && action.end !== undefined;
    next = { ...next, loop: hasRange ? { startTime: action.start, duration: action.end - action.start } : null };
  }

  // a whole-route loop starts at the first video frame
  const { currentRoute, loop, zoom } = next;
  if (currentRoute?.videoStartOffset && loop && zoom && loop.startTime === zoom.start && zoom.start === 0
    && currentRoute.videoStartOffset > loop.startTime) {
    next = {
      ...next,
      loop: {
        startTime: currentRoute.videoStartOffset,
        duration: loop.duration - currentRoute.videoStartOffset,
      },
    };
  }
  return next;
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

/**
 * @typedef {object} AttachedPlayer
 * @property {HTMLVideoElement} video
 * @property {(videoTimeMs: number) => void} seekTo  sets currentTime, resuming loading after a fatal error
 * @property {() => void} play  video.play(); a blocked play() leaves the element paused
 */

/** @type {AttachedPlayer | null} */
let attached = null;

export function attachPlayer(player) {
  attached = player;
  return () => {
    if (attached === player) attached = null;
  };
}

// route milliseconds; the loop ends no later than the video does
export function playbackBounds(state, video) {
  const videoStart = state.currentRoute?.videoStartOffset || 0;
  const videoDuration = video && Number.isFinite(video.duration) ? video.duration * 1000 : Infinity;
  const loopStart = state.loop?.startTime ?? state.zoom?.start ?? 0;
  const rangeEnd = state.loop ? state.loop.startTime + state.loop.duration : (state.zoom?.end ?? Infinity);
  return { videoStart, videoDuration, loopStart, loopEnd: Math.min(rangeEnd, videoStart + videoDuration) };
}

export function offsetOf(state) {
  const bounds = playbackBounds(state, attached?.video);
  if (!attached) {
    return bounds.loopStart;
  }
  return attached.video.currentTime * 1000 + bounds.videoStart;
}

// analytics listens for these actions

export function seek(offset) {
  return (dispatch, getState) => {
    if (attached) {
      attached.seekTo(seekTarget(offset, playbackBounds(getState(), attached.video)));
    }
    dispatch({ type: Types.ACTION_SEEK, offset: offsetOf(getState()), speed: attached?.video.playbackRate });
  };
}

export function play() {
  return (dispatch, getState) => {
    attached?.play();
    dispatch({ type: Types.ACTION_PLAY, offset: offsetOf(getState()), speed: attached?.video.playbackRate });
  };
}

export function pause() {
  return (dispatch, getState) => {
    attached?.video.pause();
    dispatch({ type: Types.ACTION_PAUSE, offset: offsetOf(getState()), speed: attached?.video.playbackRate });
  };
}

/**
 * @typedef {object} VideoSnapshot
 * @property {number} currentTime
 * @property {boolean} paused
 * @property {boolean} seeking
 * @property {Array<[number, number]>} buffered  buffered ranges, start inclusive, end exclusive
 * @property {'' | 'missing' | 'network'} err    fatal load error; buffered data still plays
 */

/**
 * @typedef {object} PlaybackBounds
 * @property {number} videoStart     route offset of video time 0 (videoStartOffset)
 * @property {number} videoDuration  video duration
 * @property {number} loopStart      loop or clip start, route offset
 * @property {number} loopEnd        loop or clip end, route offset
 */

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

export function bufferedAhead(el) {
  const range = el.buffered.find(([start, end]) => start <= el.currentTime && el.currentTime < end);
  return range ? range[1] - el.currentTime : 0;
}

export function canPlay(el) {
  return !el.seeking && bufferedAhead(el) > 0;
}

export function visibleError(el) {
  return el.err !== '' && !canPlay(el) ? el.err : '';
}

export function isLoading(el, bounds) {
  return el.err === '' && (el.seeking || (!el.paused && bufferedAhead(el) === 0 && el.currentTime < bounds.videoDuration));
}

export function isPlaying(el) {
  return !el.paused;
}

export function seekTarget(r, bounds) {
  return clamp(clamp(r, bounds.loopStart, bounds.loopEnd) - bounds.videoStart, 0, bounds.videoDuration);
}

// the video end is handled on 'ended': the engine pauses before that timeupdate
export function loopWrapTarget(el, bounds) {
  if (el.paused || el.seeking || el.currentTime >= bounds.videoDuration || el.currentTime + bounds.videoStart < bounds.loopEnd) {
    return null;
  }
  return loopRestartTime(bounds);
}

export function loopRestartTime(bounds) {
  return clamp(bounds.loopStart - bounds.videoStart, 0, bounds.videoDuration);
}

export function resumesOnline(el, online) {
  return online && el.err === 'network';
}
