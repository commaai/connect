import store from '../store';

// Once a route's video has loaded, its position is the playback clock.
let video = null;

// Make a loaded video the clock, or pass null to fall back to the last offset in redux.
export function attachVideo(element) {
  video = element;
}

function clampToLoop(offset, loop) {
  if (!loop) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
}

function videoStartOffset(state) {
  return state.currentRoute?.videoStartOffset || 0;
}

// The video's position as an offset into the route, ignoring the loop. null while no video is loaded.
export function videoOffset(state = store.getState()) {
  return video ? (video.currentTime * 1000) + videoStartOffset(state) : null;
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  const offset = videoOffset(state) ?? state.offset ?? state.loop?.startTime ?? 0;
  return clampToLoop(offset, state.loop);
}

/**
 * Move the video to an offset into the route, clamped to the loop
 *
 * @param {number} offset
 * @param {object} state
 * @returns {number} the clamped offset
 */
export function seekVideo(offset, state = store.getState()) {
  const clamped = clampToLoop(offset, state.loop);
  if (video) {
    video.currentTime = Math.max(0, (clamped - videoStartOffset(state)) / 1000);
  }
  return clamped;
}
