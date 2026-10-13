import store from '../store';
import { readRouteOffsetMs } from './media';

/**
 * Current playback position in route milliseconds.
 *
 * @param {object} [state]
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  return readRouteOffsetMs(state);
}
