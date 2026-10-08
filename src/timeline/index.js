import store from '../store';

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime != null) {
    offset = state.loop.startTime;
  } else {
    // Media observations and explicit seek commands own time; never estimate it from a wall clock.
    offset = state.offset;
  }

  if (offset !== null && state.loop?.startTime != null) {
    // Clamp display position; only the media player may initiate a loop seek.
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (state.loop.duration > 0 && offset > loopOffset + state.loop.duration) {
      offset = loopOffset + state.loop.duration;
    }
  }
  return offset;
}