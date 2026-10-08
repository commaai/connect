import store from '../store';
import { playerOffset } from './player';

/**
 * Get current playback offset: the video's, or else extrapolated from state.
 *
 * @param {object} [state] extrapolate from this state, ignoring the video
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    const offset = playerOffset();
    if (offset !== null) {
      return offset;
    }
    state = store.getState();
  }

  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}