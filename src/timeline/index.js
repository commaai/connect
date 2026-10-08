import store from '../store';

// The video is the clock. DriveVideo registers its player here while a video is loaded,
// and everything that shows a time asks currentOffset() for it.
let player = null;

export function setPlayer(newPlayer) {
  player = newPlayer;
}

/**
 * Get current playback offset, in milliseconds from the start of the route
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }
  if (player?.getDuration()) {
    return (player.getCurrentTime() * 1000) + (state.currentRoute?.videoStartOffset || 0);
  }
  // no video yet: where it will start once it has loaded
  return state.offset ?? state.loop?.startTime ?? 0;
}
