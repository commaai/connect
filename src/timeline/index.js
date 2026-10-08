import store from '../store';

let playbackVideo = null;

export function setPlaybackVideo(video) {
  playbackVideo = video;
}

export function clampToLoop(offset, loop) {
  if (offset === null || !loop) {
    return offset;
  }
  return Math.max(loop.startTime, Math.min(offset, loop.startTime + loop.duration));
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  /** @type {number} */
  let offset = state.offset;
  if (playbackVideo && playbackVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
    offset = playbackVideo.currentTime * 1000 + (state.currentRoute?.videoStartOffset || 0);
  } else if (offset === null && state.loop) {
    offset = state.loop.startTime;
  }

  return clampToLoop(offset, state.loop);
}
