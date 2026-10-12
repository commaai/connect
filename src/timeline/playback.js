// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { clampToLoop } from '.';

export function reducer(_state, action) {
  const state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = clampToLoop(action.offset, state.loop);
      state.seekId += 1;
      break;
    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;
    case Types.ACTION_PLAY:
      state.desiredPlaySpeed = action.speed;
      break;
    case Types.ACTION_LOOP:
      if (action.start !== null && action.start !== undefined && action.end !== null && action.end !== undefined) {
        state.loop = {
          startTime: action.start,
          duration: action.end - action.start,
        };
      } else {
        state.loop = null;
      }
      break;
    case Types.ACTION_RESET:
      state.desiredPlaySpeed = 1;
      state.offset = null; // start of the loop
      state.seekId += 1;
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

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
