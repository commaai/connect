// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { clampToLoop, currentOffset } from '.';

export function reducer(_state, action) {
  const state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = clampToLoop(action.offset, state.loop);
      state.seekRequest = { offset: state.offset };
      break;
    case Types.ACTION_PAUSE:
      state.isPlaying = false;
      state.offset = currentOffset(state);
      break;
    case Types.ACTION_PLAY:
      state.isPlaying = true;
      break;
    case Types.ACTION_PLAYBACK_SPEED:
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
      state.isPlaying = true;
      state.offset = 0;
      state.seekRequest = { offset: 0 };
      break;
    default:
      break;
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

// resume the playback
export function play() {
  return {
    type: Types.ACTION_PLAY,
  };
}

export function setPlaySpeed(speed) {
  return {
    type: Types.ACTION_PLAYBACK_SPEED,
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
