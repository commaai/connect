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

  if (state.offset === null && state.loop?.startTime != null) {
    return state.loop.startTime;
  }
  return state.offset;
}
