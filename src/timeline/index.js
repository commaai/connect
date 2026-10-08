import store from '../store';
import { getVideoClock } from './playerClock';

/**
 * Clamp an offset into the active loop, if any.
 *
 * This is the single definition of loop bounds, shared by currentOffset() and
 * the playback reducer so they can never disagree. Positions are clamped into
 * [start, end]; wrapping back to the loop start when playback reaches the end
 * is handled explicitly by the player (onEnded), not here.
 *
 * @param {number} offset route-relative ms
 * @param {object} loop { startTime, duration } or null
 * @returns {number}
 */
export function wrapLoop(offset, loop) {
  if (offset === null || offset === undefined || !loop?.startTime) {
    return offset;
  }
  const loopStart = loop.startTime;
  const loopEnd = loopStart + loop.duration;
  if (offset < loopStart) {
    return loopStart;
  }
  if (offset > loopEnd) {
    return loopEnd;
  }
  return offset;
}

/**
 * Get the current playback offset in route-relative milliseconds.
 *
 * The video element is the source of truth: if a live clock is registered we
 * read it directly. Otherwise (map-only view, before load, tests) we fall back
 * to the last position stored in redux. There is no Date.now() extrapolation —
 * the video, not a virtual clock, drives the position.
 *
 * @param {object} [state]
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  const live = getVideoClock();
  let offset;
  if (live !== null) {
    offset = live;
  } else if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    offset = state.offset;
  }

  return wrapLoop(offset, state.loop);
}
