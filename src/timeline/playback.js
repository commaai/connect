// Playback state follows the drive's <video>: the player reports what the video does
// (play, pause, a new rate), and seeking moves the video itself.
import * as Types from '../actions/types';
import { moveTo } from '.';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return { ...state, offset: action.offset };
    case Types.ACTION_PLAY:
      return { ...state, isPlaying: true };
    case Types.ACTION_PAUSE:
      return { ...state, isPlaying: false };
    case Types.ACTION_PLAYBACK_RATE:
      return { ...state, playbackRate: action.rate };
    case Types.ACTION_LOOP: {
      const { start, end } = action;
      return { ...state, loop: start != null && end != null ? { startTime: start, duration: end - start } : null };
    }
    default:
      return state;
  }
}

// Moves the playhead to an offset into the route, in milliseconds, kept inside the loop.
export function seek(offset) {
  return (dispatch, getState) => {
    const { loop } = getState();
    if (loop) {
      offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
    }
    moveTo(offset);
    dispatch({ type: Types.ACTION_SEEK, offset });
  };
}

export const play = () => ({ type: Types.ACTION_PLAY });

export const pause = () => ({ type: Types.ACTION_PAUSE });

export const playbackRateChanged = (rate) => ({ type: Types.ACTION_PLAYBACK_RATE, rate });

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}
