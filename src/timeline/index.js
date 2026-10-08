import store from '../store';

let player = null;

export function registerPlayer(newPlayer) {
  player = newPlayer;
  return () => {
    if (player === newPlayer) {
      player = null;
    }
  };
}

export function getPlayer() {
  return player;
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    if (player) {
      return player.getOffset();
    }
    state = store.getState();
  }

  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    offset = state.offset + ((Date.now() - state.startTime) * state.desiredPlaySpeed);
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
