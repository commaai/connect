import store from '../store';

// Observe the media clock, including while paused, buffering or in a background tab.
export function currentOffset(state = store.getState()) {
  return state.offset ?? state.loop?.startTime ?? 0;
}
