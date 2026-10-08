// The video element is the source of truth for playback time.
//
// DriveVideo attaches its <video> element here once it knows its duration.
// While a video is attached for the current route, currentOffset() reads the
// position straight from it, and seeks are applied to it. When no video is
// attached (still loading, no video for the route, map-only view) the redux
// playback clock in ./playback.js keeps time instead.
import * as Types from '../actions/types';

const HAVE_METADATA = 1;

let video = null;
let videoRoute = null;

/**
 * @param {HTMLVideoElement} el
 * @param {string} routeName fullname of the route the video belongs to
 */
export function attachVideo(el, routeName) {
  video = el;
  videoRoute = routeName;
}

/**
 * @param {HTMLVideoElement} [el] only detach if this element is attached
 */
export function detachVideo(el) {
  if (el === undefined || el === video) {
    video = null;
    videoRoute = null;
  }
}

function activeVideo(route) {
  if (!video || !route || route.fullname !== videoRoute || video.readyState < HAVE_METADATA) {
    return null;
  }
  return video;
}

/**
 * Current position of the attached video, in milliseconds from the start of the route.
 *
 * @param {object} route current route
 * @returns {number | null} null if no video is attached for this route
 */
export function videoOffset(route) {
  const el = activeVideo(route);
  if (!el) {
    return null;
  }
  return (el.currentTime * 1000) + (route.videoStartOffset || 0);
}

/**
 * Seek the attached video to an offset from the start of the route.
 *
 * @param {object} route current route
 * @param {number} offset milliseconds from the start of the route
 * @returns {boolean} whether a video was seeked
 */
export function seekVideo(route, offset) {
  const el = activeVideo(route);
  if (!el || offset === null || offset === undefined || Number.isNaN(offset)) {
    return false;
  }

  let time = Math.max(0, (offset - (route.videoStartOffset || 0)) / 1000);
  if (Number.isFinite(el.duration)) {
    time = Math.min(time, el.duration);
  }
  el.currentTime = time;
  return true;
}

// Apply playback position changes from redux to the attached video.
export const videoMiddleware = ({ getState }) => (next) => (action) => {
  const result = next(action);

  if (action.type === Types.ACTION_SEEK || action.type === Types.ACTION_RESET) {
    const { currentRoute, offset } = getState();
    seekVideo(currentRoute, offset);
  } else if (action.type === Types.ACTION_LOOP) {
    const { currentRoute, loop } = getState();
    const offset = videoOffset(currentRoute);
    if (offset !== null && loop && (offset < loop.startTime || offset > loop.startTime + loop.duration)) {
      seekVideo(currentRoute, loop.startTime);
    }
  }

  return result;
};
