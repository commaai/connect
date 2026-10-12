import store from '../store';

// set by DriveVideo while a video is mounted, the video element is then the playback clock
let videoClock = null;

/**
 * @param {{ route: string, getOffset: () => number } | null} clock
 */
export function setVideoClock(clock) {
  videoClock = clock;
}

/**
 * Get the playback offset from the mounted video, if it belongs to the current route
 *
 * @param {object} state
 * @returns {number|null}
 */
export function videoOffset(state) {
  if (videoClock && videoClock.route === state.currentRoute?.fullname) {
    return videoClock.getOffset();
  }
  return null;
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

  const video = videoOffset(state);
  if (video !== null) {
    return video;
  }

  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    offset = state.offset + ((Date.now() - state.startTime) * state.desiredPlaySpeed);
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