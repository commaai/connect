// The drive <video> element is the playback clock. DriveVideo registers it here so the
// timeline, map and time display can read the playhead every frame without going through redux.
// This module doesn't import the store, so the analytics middleware can use it too.
let videoElement = null;

export function setVideoElement(element) {
  videoElement = element;
}

/**
 * Playhead in milliseconds from the start of the route, or null while no video is loaded
 * (e.g. its segments were never uploaded)
 *
 * @param {object} state
 * @returns {number|null}
 */
export function videoOffset(state) {
  if (!videoElement || videoElement.readyState === 0 || !state.currentRoute) {
    return null;
  }
  // logs start before the video does, so video time 0 is videoStartOffset into the route
  return (videoElement.currentTime * 1000) + (state.currentRoute.videoStartOffset || 0);
}
