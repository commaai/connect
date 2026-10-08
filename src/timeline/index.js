import store from '../store';

let playbackClock = null;
const playbackListeners = new Set();
let playbackFrame = null;
let unsubscribePlayback = null;
let previousPlaybackState = null;

function schedulePlaybackFrame() {
  if (playbackFrame === null && playbackListeners.size) {
    playbackFrame = requestAnimationFrame(() => {
      playbackFrame = null;
      for (const listener of playbackListeners) listener.callback();
      const state = store.getState();
      if (state.currentRoute && state.desiredPlaySpeed > 0 && !state.isBufferingVideo) {
        schedulePlaybackFrame();
      }
    });
  }
}

/** Share one animation frame while playing; paused media changes refresh once. */
export function subscribePlaybackFrames(callback) {
  const listener = { callback };
  playbackListeners.add(listener);
  if (!unsubscribePlayback) {
    previousPlaybackState = store.getState();
    unsubscribePlayback = store.subscribe(() => {
      const state = store.getState();
      const previous = previousPlaybackState;
      previousPlaybackState = state;
      if (state.offset !== previous.offset || state.seekRequest !== previous.seekRequest
        || state.currentRoute !== previous.currentRoute || state.zoom !== previous.zoom
        || state.desiredPlaySpeed !== previous.desiredPlaySpeed || state.isBufferingVideo !== previous.isBufferingVideo) {
        schedulePlaybackFrame();
      }
    });
  }
  schedulePlaybackFrame();
  return () => {
    playbackListeners.delete(listener);
    if (!playbackListeners.size) {
      if (playbackFrame !== null) cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
      unsubscribePlayback?.();
      unsubscribePlayback = null;
      previousPlaybackState = null;
    }
  };
}

/** Register the active video's clock without dispatching on every frame. */
export function attachPlaybackClock(fullname, readOffset) {
  const registration = { fullname, readOffset };
  playbackClock = registration;
  return () => {
    if (playbackClock === registration) {
      playbackClock = null;
    }
  };
}

/** Return the video position, in milliseconds from the route start. */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
    if (playbackClock && playbackClock.fullname === state.currentRoute?.fullname) {
      try {
        const offset = playbackClock.readOffset();
        if (Number.isFinite(offset)) {
          return offset;
        }
      } catch {
        // A source can disappear between the animation frame and this read.
      }
    }
  }
  if (Number.isFinite(state.offset)) {
    return state.offset;
  }

  // Before the first video frame, show the selected starting position.
  return state.seekRequest?.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
