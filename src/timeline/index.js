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
  if (state.offset === null && state.zoom?.startTime) {
    offset = state.zoom.start - state.filter.start;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.zoom?.startTime) {
    // respect the loop
    const loopOffset = state.zoom.start - state.filter.start;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.zoom.duration) {
      offset = ((offset - loopOffset) % state.zoom.duration) + loopOffset;
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
