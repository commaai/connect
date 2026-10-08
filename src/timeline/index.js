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
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : (state.videoPlaySpeed ?? state.desiredPlaySpeed);
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop && state.loop.startTime !== null && state.loop.duration > 0) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = state.videoPlaySpeed == null
        ? ((offset - loopOffset) % state.loop.duration) + loopOffset
        : loopOffset + state.loop.duration;
    }
  }
  return offset;
}
