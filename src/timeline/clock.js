export function currentOffset(state) {
  // The video is the clock, even while paused, seeking, buffering or failed.
  if (state.mediaRoute && state.mediaRoute === state.currentRoute?.fullname) {
    return state.offset ?? state.loop?.startTime ?? 0;
  }

  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime != null) {
    offset = state.loop.startTime;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime != null && state.loop.duration > 0) {
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
