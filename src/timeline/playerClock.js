// playerClock: the single seam that makes "video drives state" possible.
//
// The active <video> element registers a reader that returns the live
// playback position in route-relative milliseconds (i.e. already shifted by
// videoStartOffset). currentOffset() reads through this so the map marker,
// timeline ruler and time readout animate smoothly from the real element
// position instead of a Date.now()-based virtual clock.
//
// When no reader is registered (map-only tab, before the video has loaded, or
// in unit tests) getVideoClock() returns null and callers fall back to the
// position stored in redux.

/** @type {(() => number) | null} */
let reader = null;

/**
 * Register the live playback-position reader. The video element owns this.
 *
 * @param {() => number} fn returns the current position in route-relative ms
 */
export function registerVideoClock(fn) {
  reader = fn;
}

/**
 * Clear the reader. Call on unmount / when the video goes away so stale
 * positions are never read.
 *
 * @param {() => number} [fn] only clears if it matches the active reader
 */
export function clearVideoClock(fn) {
  if (!fn || reader === fn) {
    reader = null;
  }
}

/**
 * Read the live playback position, or null when no video is driving.
 *
 * @returns {number | null} route-relative ms, or null
 */
export function getVideoClock() {
  if (!reader) {
    return null;
  }
  const value = reader();
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value;
}
