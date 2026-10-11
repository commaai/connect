import store from '../store';

// the <video> of the open drive. it is the playback clock: nothing else keeps time
export let video = null;

export function attachVideo(el) {
  video = el;
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (!video) {
    return state.zoom?.start ?? 0;
  }
  return (video.currentTime * 1000) + (state.currentRoute?.videoStartOffset || 0);
}

// logs start earlier than video, so offsets before the first frame land on it
export function seekVideo(offset, state) {
  video.currentTime = Math.max(0, offset - (state.currentRoute?.videoStartOffset || 0)) / 1000;
}

// the selected range loops: playback that leaves it goes back to its start
export function loopVideo(state) {
  const { zoom } = state;
  const offset = currentOffset(state);
  if (offset < zoom.start || offset >= zoom.end) {
    seekVideo(zoom.start, state);
  }
}
