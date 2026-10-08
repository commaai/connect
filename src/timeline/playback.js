// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { currentOffset } from '.';

export function reducer(_state, action) {
  let state = { ..._state };
  let loopOffset = null;
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime;
  }
  switch (action.type) {
    case Types.ACTION_SEEK:
      state = {
        ...state,
        offset: action.offset,
        startTime: Date.now(),
      };

      if (loopOffset !== null) {
        if (state.offset < loopOffset) {
          state.offset = loopOffset;
        } else if (state.offset > (loopOffset + state.loop.duration)) {
          state.offset = loopOffset + state.loop.duration;
        }
      }
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: currentOffset(state),
        startTime: Date.now(),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_MAX_PLAY_SPEED:
      state.maxPlaySpeed = action.speed;
      // fall through: clamp the current speed to the new cap
    case Types.ACTION_PLAY: {
      const speed = Math.min(action.type === Types.ACTION_PLAY ? action.speed : state.desiredPlaySpeed, state.maxPlaySpeed || Infinity);
      if (speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: currentOffset(state),
          desiredPlaySpeed: speed,
          startTime: Date.now(),
        };
      }
      break;
    }
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
      state = {
        ...state,
        desiredPlaySpeed: 1,
        offset: 0,
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

  // normalize over loop
  if (state.offset !== null && state.loop?.startTime) {
    const offset = state.offset + (Date.now() - state.startTime) * state.desiredPlaySpeed;
    loopOffset = state.loop.startTime;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      state.offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
      state.startTime = Date.now();
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

// the fastest speed the picked video engine plays smoothly, or null for no cap
export function setMaxPlaySpeed(speed) {
  return {
    type: Types.ACTION_MAX_PLAY_SPEED,
    speed,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
