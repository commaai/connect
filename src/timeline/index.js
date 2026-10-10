import store from '../store';

// while a route's video is loaded, its position is the playback clock
let videoClock = null;

/**
 * Make a video the playback clock, or hand the clock back to redux with null
 *
 * @param {string} route fullname of the route the video belongs to
 * @param {function(): number} getOffset video position as a route offset in ms
 */
export function setVideoClock(route, getOffset) {
  videoClock = getOffset ? { route, getOffset } : null;
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
  let offset;
  if (videoClock && videoClock.route === state.currentRoute?.fullname) {
    offset = videoClock.getOffset();
  } else if (state.offset === null && state.loop?.startTime) {
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