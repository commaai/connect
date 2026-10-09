import store from '../store';

let videoClock = null;

// Read the media clock directly for smooth map/timeline animation between timeupdate events.
export function setVideoClock(clock) {
  videoClock = clock;
  return () => {
    if (videoClock === clock) videoClock = null;
  };
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state && videoClock) {
    const offset = videoClock();
    if (offset !== null) return offset;
  }
  state = state || store.getState();
  return state.offset ?? state.loop?.startTime ?? 0;
}
