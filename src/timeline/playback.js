// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';

export function reducer(_state, action) {
  const state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = action.offset;
      state.seekId = (state.seekId || 0) + 1;
      if (state.loop) {
        state.offset = Math.min(Math.max(state.offset, state.loop.startTime), state.loop.startTime + state.loop.duration);
      }
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
