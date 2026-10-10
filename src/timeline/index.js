import store from '../store';

let videoClock;

export function setVideoClock(clock) {
  videoClock = clock;
  return () => { if (videoClock === clock) videoClock = null; };
}

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
  const mediaOffset = videoClock?.(state);
  let offset;
  if (mediaOffset != null) {
    offset = mediaOffset;
  } else if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.duration > 0 && state.loop.startTime != null) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = mediaOffset != null ? loopOffset + state.loop.duration
        : ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}