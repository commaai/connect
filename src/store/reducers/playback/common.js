/**
 * fetch current playback offset, relative to `state.filter.start`
 */
export const currentOffset = (state) => {
  let offset;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime - state.filter.start;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime - state.filter.start;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
};

export const getCurrentRoute = (state, o) => {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.routes || !offset) {
    return null;
  }

  return state.routes.find((r) => offset >= r.offset && offset <= r.offset + r.duration);
};
