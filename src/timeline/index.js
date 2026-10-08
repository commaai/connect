import store from '../store';

// The drive video { element, route, toRouteOffset(seconds) } while it is the playback clock
let video = null;

export function setVideo(source) {
  video = source;
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

  if (video && video.route === state.currentRoute?.fullname && video.element.readyState > 0) {
    // the video is sent back to the start of the range on its next timeupdate
    const offset = video.toRouteOffset(video.element.currentTime);
    return state.loop?.duration > 0 ? Math.min(offset, state.loop.startTime + state.loop.duration) : offset;
  }

  // without a video (map view, missing or failed video), continue from where it left off
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
