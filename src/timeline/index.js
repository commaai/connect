import store from '../store';
import { videoOffsetMs } from './video';

/**
 * Get current playback offset
 *
 * The <video> element is the clock once it is attached and has metadata; before that, redux holds the intent.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  let offset = videoOffsetMs(state.currentRoute);
  if (offset === null) {
    return state.offset ?? state.loop?.startTime ?? 0;
  }

  if (state.loop) {
    // respect the loop
    offset = Math.min(Math.max(offset, state.loop.startTime), state.loop.startTime + state.loop.duration);
  }
  return offset;
}
