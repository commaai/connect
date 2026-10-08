import * as Types from '../actions/types';

// The route's <video> element owns playback time while one is attached.
// Without one (map view, no video, load error) a wall clock in Redux takes over.
let video = null;
// Route offset (ms) the attached video starts at, until it has metadata.
let startOffset = null;
// The store this middleware runs in.
let store = null;

function videoTime(state, offset) {
  return Math.max(0, (offset - (state.currentRoute?.videoStartOffset || 0)) / 1000);
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  /** @type {number} */
  let offset;
  if (video && startOffset === null) {
    offset = (state.currentRoute?.videoStartOffset || 0) + (video.currentTime * 1000);
  } else if (video) {
    offset = startOffset;
  } else if (state.offset === null) {
    offset = state.loop?.startTime || 0;
  } else {
    offset = state.offset + ((Date.now() - state.startTime) * state.desiredPlaySpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}

// Attach the element that plays the current route (again after a new source), or null to hand
// time back to the wall clock at the video's position.
export function setVideo(el) {
  if (video && !el) {
    const offset = currentOffset();
    video = null;
    store.dispatch({ type: Types.ACTION_SEEK, offset });
  }
  video = null;
  startOffset = el ? currentOffset() : null;
  video = el;
}

// Call on loadedmetadata: move the new video to where playback should start.
export function videoReady() {
  if (video && startOffset !== null) {
    video.currentTime = videoTime(store.getState(), startOffset);
    startOffset = null;
  }
}

// Unmute or mute inside the user's tap: iOS pauses a video that gains sound outside a gesture.
export function setVideoMuted(muted) {
  if (video) {
    video.muted = muted;
  }
}

// Playback actions command the attached video inside the dispatch, so a tap's play() and seek
// run in the same user gesture. The video's own events then report what really happened.
export function videoMiddleware(api) {
  store = api;
  return (next) => (action) => {
    const result = next(action);
    if (!video) {
      return result;
    }
    const state = api.getState();
    if (action.type === Types.ACTION_SEEK || action.type === Types.ACTION_RESET) {
      if (startOffset !== null) {
        startOffset = state.offset;
      } else {
        video.currentTime = videoTime(state, state.offset);
      }
    }
    if (action.type === Types.ACTION_PLAY || action.type === Types.ACTION_RESET) {
      video.playbackRate = state.desiredPlaySpeed;
      if (video.paused) {
        video.play()?.catch((err) => {
          // AbortError means a pause() or a new source interrupted play(): nothing to undo
          if (err.name === 'NotAllowedError') {
            api.dispatch({ type: Types.ACTION_PAUSE });
          }
        });
      }
    } else if (action.type === Types.ACTION_PAUSE) {
      video.pause();
    }
    return result;
  };
}
