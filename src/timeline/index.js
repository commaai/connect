import store from '../store';

// The media element reports route-relative milliseconds. Never advance time
// independently: paused, seeking and stalled video must also stop the map.
export function currentOffset(state = store.getState()) {
  return state.offset ?? state.loop?.startTime ?? 0;
}
