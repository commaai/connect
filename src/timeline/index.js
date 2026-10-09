import store from '../store';

let mediaClock = null;

// The viewer owns this clock. Cleanup cannot disconnect a newer source.
export function attachMediaClock(route, read) {
  const clock = { route, read };
  mediaClock = clock;
  return () => { if (mediaClock === clock) mediaClock = null; };
}

export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
    if (mediaClock && mediaClock.route === state.currentRoute?.fullname) return mediaClock.read();
  }
  return state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
