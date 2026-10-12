import store from '../store';

// The <video> element is the playback clock. DriveVideo registers a getter that
// returns the playback position in ms (relative to the route start), or null
// while no video is loaded.
let videoClock = null;

export function setVideoClock(getter) {
  videoClock = getter;
}

// loaded parts of the video as [start, end] ms pairs, same timebase as the clock
let videoBuffered = null;

export function setVideoBuffered(getter) {
  videoBuffered = getter;
}

export function bufferedRanges() {
  return videoBuffered?.() ?? [];
}

export function clampToLoop(offset, loop) {
  if (!loop) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
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
  // before the video can tell, fall back to the last requested position
  const offset = videoClock?.() ?? state.offset ?? state.loop?.startTime ?? 0;
  return clampToLoop(offset, state.loop);
}
