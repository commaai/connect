import store from '../store';
import { videoOffset } from './video';

/**
 * Get current playback offset, in milliseconds from the start of the route
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  // without a loaded video, fall back to the last requested position
  return videoOffset(state) ?? state.offset ?? state.loop?.startTime ?? 0;
}
