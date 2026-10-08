import store from '../store';

/** Playback position in route milliseconds, last reported by the media element. */
export function currentOffset(state = null) {
  state = state || store.getState();
  return state.offset ?? state.loop?.startTime ?? 0;
}
