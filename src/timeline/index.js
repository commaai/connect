import store from '../store';
import { playbackRange, videoOffset } from './video';

/**
 * Get current playback offset
 *
 * Reads the attached video when there is one, otherwise the redux playback clock.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  const fromVideo = videoOffset(state.currentRoute);
  if (fromVideo !== null) {
    // the video can be a frame past the range end before it is sent back, so clamp
    const range = playbackRange(state.loop, state.zoom);
    return range ? Math.min(Math.max(fromVideo, range.start), range.end) : fromVideo;
  }

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
