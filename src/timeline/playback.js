// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
//
// The <video> element owns the playhead (see currentOffset). This state only holds what the user
// asked for: the speed (0 = paused), the loop, and seek requests. A seek request is `offset` plus
// `startTime`, which changes on every request so seeking to the same offset twice still applies.
import * as Types from '../actions/types';

function clampToLoop(offset, loop) {
  if (!loop || loop.startTime === null) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
}

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = clampToLoop(action.offset, state.loop);
      state.startTime = Date.now();
      break;
    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;
    case Types.ACTION_PLAY:
      state.desiredPlaySpeed = action.speed;
      break;
    case Types.ACTION_LOOP:
      // whole-route URLs have no range (NaN start/end), which means no loop
      if (Number.isFinite(action.start) && Number.isFinite(action.end)) {
        state.loop = {
          startTime: action.start,
          duration: action.end - action.start,
        };
        // move the playhead into the new loop if it is outside of it
        if (state.offset === null || clampToLoop(state.offset, state.loop) !== state.offset) {
          state.offset = state.loop.startTime;
          state.startTime = Date.now();
        }
      } else {
        state.loop = null;
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state.isBufferingVideo = Boolean(action.buffering);
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: null,
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  if (state.currentRoute && state.currentRoute.videoStartOffset && state.loop && state.zoom
    && state.loop.startTime === state.zoom.start && state.zoom.start === 0) {
    const loopRouteOffset = state.loop.startTime - state.zoom.start;
    if (state.currentRoute.videoStartOffset > loopRouteOffset) {
      state.loop = {
        startTime: state.zoom.start + state.currentRoute.videoStartOffset,
        duration: state.loop.duration - (state.currentRoute.videoStartOffset - loopRouteOffset),
      };
    }
  }

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume / change play speed
export function play(speed = 1) {
  return {
    type: Types.ACTION_PLAY,
    speed,
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
