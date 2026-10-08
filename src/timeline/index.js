import store from '../store';
import { offsetAt } from './offset';

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
  return offsetAt(state, Date.now());
}