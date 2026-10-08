import store from '../store';

// The <video> element playing the current route. It is the playback clock:
// everything that shows the playback position reads it through currentOffset().
let video = null;

export function getVideo() {
  return video;
}

export function setVideo(element) {
  video = element;
}

/**
 * Get the current playback position, in milliseconds from the start of the route.
 * Comes from the video once it has loaded, otherwise from the last seek.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (video?.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return (video.currentTime * 1000) + (state.currentRoute?.videoStartOffset || 0);
  }
  return state.offset ?? state.loop?.startTime ?? 0;
}
