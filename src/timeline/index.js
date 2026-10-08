import store from '../store';
import { offsetOf } from './playback';

/**
 * Current playback position in route milliseconds.
 *
 * @returns {number}
 */
export function currentOffset() {
  return offsetOf(store.getState());
}
