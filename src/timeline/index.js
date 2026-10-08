import store from '../store';

// the <video> element is the playback clock, DriveVideo attaches it while mounted
let video = null;

export function attachVideo(el) {
  video = el;
}

/**
 * Get current playback offset in milliseconds from the start of the route.
 * Reads the video while it has loaded, otherwise the last seek target.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  let offset = state.offset ?? state.loop?.startTime ?? 0;
  if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    offset = (state.currentRoute?.videoStartOffset || 0) + (video.currentTime * 1000);
  }

  if (state.loop) {
    offset = Math.min(Math.max(offset, state.loop.startTime), state.loop.startTime + state.loop.duration);
  }
  return offset;
}
