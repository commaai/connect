// Registry for the single <video> element that drives playback.
//
// currentOffset() consults this module: when a video element is registered
// and has loaded metadata, the element's clock is the source of truth.
// Otherwise everything falls back to the wall-clock extrapolation.
let videoElement = null;

export function registerVideoElement(el) {
  videoElement = el;
}

export function unregisterVideoElement() {
  videoElement = null;
}

// Current playback position in seconds, or null when no video is driving.
export function getVideoTime() {
  if (!videoElement || videoElement.readyState === 0) {
    return null;
  }
  return videoElement.currentTime;
}
