import store from '../store';

/**
 * Get current playback offset, relative to `state.filter.start`
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
}

/**
 * Get current route
 *
 * @param {object} state
 * @param {number} [offset]
 * @returns {*|null}
 */
export function getCurrentRoute(state, offset) {
  if (!state.routes) return null;

  offset = offset || currentOffset(state);
  if (offset === null) return null;

  return state.routes
    .find((route) => offset >= route.offset && offset <= route.offset + route.duration);
}
