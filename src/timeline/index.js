import store from '../store';

// Media events publish the route-relative position; buffering and pause never
// advance it. A selected loop supplies the initial position before media loads.
export function currentOffset(state = store.getState()) {
  return state.offset ?? state.loop?.startTime ?? 0;
}
