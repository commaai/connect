let videoElement = null;
const listeners = new Set();

/**
 * Get the mounted video element, the source of truth for playback
 *
 * @returns {HTMLVideoElement|null}
 */
export function getVideoElement() {
  return videoElement;
}

/**
 * Register (or clear with null) the mounted video element
 *
 * @param {HTMLVideoElement|null} el
 */
export function setVideoElement(el) {
  videoElement = el;
  listeners.forEach((cb) => cb());
}

/**
 * Subscribe to video element changes
 *
 * @param {Function} cb
 * @returns {Function} unsubscribe
 */
export function subscribeVideoElement(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Convert a route offset (ms) to video time (s)
 *
 * @param {object} route
 * @param {number} routeMs
 * @returns {number}
 */
export function routeMsToVideoSec(route, routeMs) {
  return Math.max(0, (routeMs - (route?.videoStartOffset || 0)) / 1000);
}

/**
 * Convert video time (s) to a route offset (ms)
 *
 * @param {object} route
 * @param {number} videoSec
 * @returns {number}
 */
export function videoSecToRouteMs(route, videoSec) {
  return (videoSec * 1000) + (route?.videoStartOffset || 0);
}


/**
 * Route offset (ms) the video is currently showing
 *
 * @param {object} route
 * @param {number} [fallback] route offset (ms) to use when no video is mounted
 * @returns {number}
 */
export function currentVideoOffset(route, fallback = 0) {
  const video = getVideoElement();
  return video ? videoSecToRouteMs(route, video.currentTime) : fallback;
}