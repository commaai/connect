import store from '../store';

// The video element is the clock. While one is mounted and has loaded, the playhead is wherever
// it is, so the timeline, map and clock always agree with what is on screen. Otherwise (map tab,
// before the video loads) time is kept from the last known position and the wall clock.
let player = null; // { video, getVideoStartOffset }

const HAVE_METADATA = 1;

/**
 * Register the mounted <video>.
 *
 * @param {HTMLVideoElement} video
 * @param {() => number} getVideoStartOffset how far into the route its first frame is, in
 *   milliseconds; asked every time, because it's learned after the route loads
 * @returns {() => void} unregister
 */
export function attachPlayer(video, getVideoStartOffset) {
  const attached = { video, getVideoStartOffset };
  player = attached;
  return () => {
    if (player === attached) {
      player = null;
    }
  };
}

/**
 * The playhead according to the video, or null if there is no loaded video.
 *
 * @returns {number | null}
 */
export function playerOffset() {
  if (!player || player.video.readyState < HAVE_METADATA) {
    return null;
  }
  return player.video.currentTime * 1000 + player.getVideoStartOffset();
}

/**
 * Get current playback offset
 *
 * @param {object} state a state to compute from, instead of what is playing now
 * @returns {number}
 */
export function currentOffset(state = null) {
  /** @type {number} */
  let offset = state ? null : playerOffset();
  if (!state) {
    state = store.getState();
  }

  if (offset === null) {
    if (state.offset === null && state.loop?.startTime) {
      offset = state.loop.startTime;
    } else {
      const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
      offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
    }
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
