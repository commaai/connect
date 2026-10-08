import store from '../store';

// the video element is the playback clock while it is attached
let video = null;

function clampToLoop(offset, loop) {
  if (!loop) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
}

function videoOffset(state) {
  return (video.currentTime * 1000) + (state.currentRoute?.videoStartOffset || 0);
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  const offset = video ? videoOffset(state) : (state.offset ?? state.loop?.startTime ?? 0);
  return clampToLoop(offset, state.loop);
}

/**
 * Seek the video to a route offset, clamped to the loop
 *
 * @param {number} offset
 * @param {object} state
 * @returns {number} the clamped offset
 */
export function seekVideo(offset, state = store.getState()) {
  offset = clampToLoop(offset, state.loop);
  const time = Math.max(0, (offset - (state.currentRoute?.videoStartOffset || 0)) / 1000);
  if (video && Math.abs(video.currentTime - time) > 0.01) {
    video.currentTime = time;
  }
  return offset;
}

/**
 * Make a loaded video element the clock, starting where the last seek left off.
 * Pass null to fall back to the last seek.
 *
 * @param {HTMLVideoElement|null} element
 */
export function attachVideo(element) {
  if (element === video) {
    return;
  }
  video = null;
  if (element) {
    const offset = currentOffset();
    video = element;
    seekVideo(offset);
  }
}

// jump back to the start of the loop once playback runs past its end
export function wrapLoop(state = store.getState()) {
  const { loop } = state;
  if (video && loop && !video.paused && videoOffset(state) >= loop.startTime + loop.duration) {
    seekVideo(loop.startTime, state);
  }
}
