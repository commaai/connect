import store from '../store';

/**
 * Get current playback offset (in milliseconds)
 *
 * The `<video>` element is the clock. It publishes its position through the
 * `videoProgress()` action and the reducer stores it verbatim in
 * `state.offset`, so this is now a plain read -- there is no startTime /
 * playSpeed extrapolation left anywhere.
 *
 * @param {object} [state] - the root state (defaults to the live store state)
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  if (state.offset === null && state.loop?.startTime) {
    return state.loop.startTime;
  }

  return state.offset;
}
