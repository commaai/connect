import store from '../store';

// The <video> showing the current drive, if any. It is the playback clock:
// play, pause and seek are applied to it, and the position is read from it.
let video = null;

export function attachVideo(element) {
  video = element;
}

export function detachVideo(element) {
  if (video === element) {
    video = null;
  }
}

function videoReady() {
  return video !== null && video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

// the drive's logs start a little before its video does
function videoStartOffset(state) {
  return state.currentRoute?.videoStartOffset || 0;
}

/**
 * Playback position in milliseconds from the start of the drive. Without a
 * loaded video, it is the position playback will start from once there is one.
 *
 * @param {object} [state]
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (videoReady()) {
    return video.currentTime * 1000 + videoStartOffset(state);
  }
  return state.offset ?? state.loop?.startTime ?? 0;
}

// Move the video to an offset. Before it has loaded, the offset is picked up
// from state by the video itself.
export function seekVideo(offset, state = store.getState()) {
  if (videoReady()) {
    video.currentTime = Math.max(0, (offset - videoStartOffset(state)) / 1000);
  }
}
