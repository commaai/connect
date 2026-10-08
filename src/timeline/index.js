import store from '../store';

/**
 * Playback position lives in the <video> element.
 *
 * This module is the single bridge between the media element and the rest of
 * the app: `currentOffset()` reads real media time, and the reducer records
 * what the video reports. Nothing extrapolates from wall-clock time, so the
 * timeline and map can never drift ahead of the picture.
 */

/**
 * @type {HTMLVideoElement|null}
 */
let video = null;

/**
 * Route offset (ms) that corresponds to video time 0. Logs can start before the
 * qcamera's first frame, so this is not always 0.
 * @type {number}
 */
let videoStartOffset = 0;

/**
 * Register the element that currently owns playback. Passing null clears it.
 * @param {HTMLVideoElement|null} element
 */
export function setVideo(element) {
  video = element;
}

/**
 * Set the route offset corresponding to video time 0, and report whether it moved.
 * Moving it while playing invalidates the offset already read from the element.
 * @param {number} offset
 * @returns {boolean} whether videoStartOffset changed
 */
export function setVideoStartOffset(offset) {
  const next = offset || 0;
  if (next === videoStartOffset) return false;
  videoStartOffset = next;
  return true;
}

/**
 * @returns {number}
 */
export function getVideoStartOffset() {
  return videoStartOffset;
}

/**
 * @returns {HTMLVideoElement|null}
 */
export function getVideo() {
  return video;
}

/**
 * Current playback offset, in milliseconds from the start of the route.
 *
 * Reads the media element when one is attached so callers always get the
 * position that is actually on screen, then falls back to the last value the
 * video reported (used before the element exists, e.g. cold entry from a URL).
 *
 * @param {object} [state]
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (video) {
    return Math.max(0, video.currentTime * 1000 + videoStartOffset);
  }

  if (!state) {
    state = store.getState();
  }

  let offset = state.offset;
  if (offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  }

  if (offset !== null && state.loop?.startTime) {
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}

/**
 * Convert a route offset to a media time for the attached element.
 * @param {number} offset route offset in ms
 * @returns {number} video time in seconds
 */
export function mediaTimeFor(offset) {
  return Math.max(0, (offset - videoStartOffset) / 1000);
}

/**
 * Reset the bridge. Exported for tests.
 */
export function resetVideo() {
  video = null;
  videoStartOffset = 0;
}