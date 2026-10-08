import store from '../store';

// A media observation or an explicit seek target, never a second wall clock.
export function currentOffset(state = store.getState()) {
  return state.offset ?? state.seekOffset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
