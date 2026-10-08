import store from '../store';

// The drive's <video>, while it is on screen and has loaded, is the playback clock.
// Without one (map view, before the video loads) playback runs off wall time.
let video = null;

/**
 * @param {{ element: HTMLVideoElement, startOffset: number }} clock
 */
export function attachVideo(clock) {
  video = clock;
}

export function detachVideo(clock) {
  if (video === clock) {
    video = null;
  }
}

function clampToLoop(offset, loop) {
  if (offset === null || !loop?.startTime) {
    return offset;
  }
  if (offset < loop.startTime) {
    return loop.startTime;
  }
  if (offset > loop.startTime + loop.duration) {
    return ((offset - loop.startTime) % loop.duration) + loop.startTime;
  }
  return offset;
}

/**
 * Where the store says playback is: the last seek or play/pause, advanced by wall time.
 *
 * @param {object} state
 * @returns {number}
 */
export function storeOffset(state) {
  if (state.offset === null && state.loop?.startTime) {
    return state.loop.startTime;
  }
  const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  return clampToLoop(state.offset + ((Date.now() - state.startTime) * playSpeed), state.loop);
}

/**
 * Get current playback offset in ms from the start of the drive.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (video) {
    return clampToLoop((video.element.currentTime * 1000) + video.startOffset, state.loop);
  }
  return storeOffset(state);
}
