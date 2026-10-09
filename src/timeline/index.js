import * as Types from '../actions/types';

// The video element is the source of truth for playback position.
// DriveVideo publishes the current offset here on every animation frame and
// everything that follows playback (timeline scrubber, map marker, time
// display) reads it. Seeks write here optimistically; the video reconciles
// on its next frame.
let offsetMs = 0;

/**
 * Get current playback offset in the current route
 *
 * @returns {number} milliseconds from route start
 */
export function currentOffset() {
  return offsetMs;
}

/**
 * Seek playback. Updates the offset the video element will jump to. The
 * offset stays put (and the UI tracks it) until the video reaches it.
 *
 * @param {number} ms milliseconds from route start
 */
export function seek(ms, dispatch = null) {
  offsetMs = Math.max(0, ms);
  dispatch?.({ type: Types.ACTION_SEEK, offset: offsetMs });
}

export function resetOffset(ms = 0) {
  offsetMs = ms;
}
