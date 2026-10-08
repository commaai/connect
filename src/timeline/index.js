import store from '../store';
import { playbackRange, videoOffset } from './video';

// The redux playback clock: keeps time when there is no video, e.g. while it loads or when it failed.
function clockOffset(state, range) {
  if (state.offset === null) {
    return range ? range.start : 0;
  }
  const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  return state.offset + ((Date.now() - state.startTime) * playSpeed);
}

/**
 * Get current playback offset
 *
 * Reads the attached video when there is one, otherwise the redux playback clock.
 * Clamped to the selected range: DriveVideo sends playback back to its start once it reaches the end.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  const range = playbackRange(state.loop, state.zoom);
  const offset = videoOffset(state.currentRoute) ?? clockOffset(state, range);
  return range ? Math.min(Math.max(offset, range.start), range.end) : offset;
}
