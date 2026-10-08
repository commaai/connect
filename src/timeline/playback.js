// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { seekVideo } from '.';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP:
      if (action.start != null && action.end != null) {
        return { ...state, loop: { startTime: action.start, duration: action.end - action.start } };
      }
      return { ...state, loop: null };
    default:
      return state;
  }
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch, getState) => {
    dispatch({
      type: Types.ACTION_SEEK,
      offset: seekVideo(offset, getState()),
    });
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
