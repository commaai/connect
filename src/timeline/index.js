import store from '../store';

// The media element publishes position; buffering and paused media never advance
// an independent clock. Before media is available, show the selected range start.
export function currentOffset(state = store.getState()) {
  return state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
