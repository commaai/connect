import store from '../store';

// The drive <video> element is the playback clock. DriveVideo registers it here so the
// timeline, map and time display can read the playhead every frame without going through redux.
let videoElement = null;

export function setVideoElement(element) {
  videoElement = element;
}

/**
 * Get current playback offset, in milliseconds from the start of the route
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (videoElement?.readyState > 0 && state.currentRoute) {
    // logs start before the video does, so video time 0 is videoStartOffset into the route
    return (videoElement.currentTime * 1000) + (state.currentRoute.videoStartOffset || 0);
  }

  // no video loaded (e.g. its segments were never uploaded): fall back to the last requested position
  return state.offset ?? state.loop?.startTime ?? 0;
}
