import store from '../store';

// The video is the clock. The timeline, the map and the time display all ask
// currentOffset() where playback is, and it asks the <video> element.
// state.offset is where playback was last sent or left; it stands in while
// there is no video to ask, before it has loaded or when it can't.
let video = null;

export function setVideo(element) {
  video = element;
}

// drive offset in ms -> video time in seconds. The video can start after the drive does.
export function videoTime(offset, route) {
  return Math.max(0, offset - (route?.videoStartOffset || 0)) / 1000;
}

const lastOffset = (state) => state.offset ?? state.loop?.startTime ?? 0;

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (!video?.readyState) {
    return lastOffset(state);
  }
  return (video.currentTime * 1000) + (state.currentRoute?.videoStartOffset || 0);
}

// Move the video to state.offset. Before it has loaded there is nothing to seek in.
export function seekVideo(state = store.getState()) {
  if (video?.readyState) {
    video.currentTime = videoTime(lastOffset(state), state.currentRoute);
  }
}
