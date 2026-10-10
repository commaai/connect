// basic helper functions for controlling playback
// redux holds what the user asked for, the video element owns the position (see ./index.js)
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
      return {
        ...state,
        loop: action.start !== null && action.start !== undefined && action.end !== null && action.end !== undefined
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, offset: 0 };
    default:
      return state;
  }
}

// seek to a specific offset, moving the video there right away
export function seek(offset) {
  return (dispatch, getState) => dispatch({
    type: Types.ACTION_SEEK,
    offset: seekVideo(offset, getState()),
  });
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
