// Playback controls. State holds what the user asked for (speed, range, where
// to seek to); the position itself comes from the video, see ./index.js.
import * as Types from '../actions/types';
import { seekVideo } from '.';

export function reducer(_state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return { ..._state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ..._state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ..._state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP:
      return {
        ..._state,
        loop: action.start != null && action.end != null
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      };
    case Types.ACTION_RESET:
      return { ..._state, desiredPlaySpeed: 1, offset: null };
    default:
      return _state;
  }
}

// seek to an offset, kept inside the selected range
export function seek(offset) {
  return (dispatch, getState) => {
    const state = getState();
    const { loop } = state;
    if (loop) {
      offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
    }
    dispatch({
      type: Types.ACTION_SEEK,
      offset,
    });
    seekVideo(offset, state);
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
