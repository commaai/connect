// playback intent set by the user; the position lives in the video, see ./index.js
import * as Types from '../actions/types';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1 };
    case Types.ACTION_LOOP: {
      const hasLoop = action.start !== null && action.start !== undefined
        && action.end !== null && action.end !== undefined;
      return {
        ...state,
        loop: hasLoop ? { startTime: action.start, duration: action.end - action.start } : null,
      };
    }
    default:
      return state;
  }
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
