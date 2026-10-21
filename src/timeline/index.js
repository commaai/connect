import store from '../store';

let video = null;

export function setVideo(element) {
  video = element;
}

export function getVideo() {
  return video;
}

export function videoTime(route, offset) {
  return Math.max(0, (offset - (route?.videoStartOffset || 0)) / 1000);
}

export function routeOffset(route, time) {
  return (route?.videoStartOffset || 0) + (time * 1000);
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  let last = state.offset;
  if (last == null) {
    if (state.loop?.startTime != null) {
      last = state.loop.startTime;
    } else if (state.zoom?.start != null) {
      last = state.zoom.start;
    } else {
      last = 0;
    }
  }

  if (!video || video.readyState < 1) {
    return last;
  }

  const offset = routeOffset(state.currentRoute, video.currentTime);
  // a seek past the end (segments not uploaded yet) keeps the seeked offset
  // while the video sits on its last frame
  if (last > offset && video.currentTime > video.duration - 1) {
    return last;
  }
  return offset;
}
