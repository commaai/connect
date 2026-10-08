import store from '../store';

// ponytail: one element. The drive view mounts a single player.
let playbackVideo = null;

export function setPlaybackVideo(video) {
  playbackVideo = video;
}

export function clampToLoop(offset, loop) {
  if (offset == null || !loop) {
    return offset;
  }
  const end = loop.startTime + loop.duration;
  return Math.max(loop.startTime, Math.min(offset, end));
}

/**
 * Get current playback offset, in milliseconds from the route start.
 * While a video is loaded this is the element. Otherwise it is the last seek.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  let offset = state.offset;
  if (playbackVideo && playbackVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
    offset = playbackVideo.currentTime * 1000 + (state.currentRoute?.videoStartOffset || 0);
  } else if (offset == null && state.loop) {
    offset = state.loop.startTime;
  }

  return clampToLoop(offset, state.loop);
}
