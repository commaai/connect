// playback intent (play speed, looping, buffering status)
// the video element owns the actual position, see ./index.js
import * as Types from '../actions/types';
import { resetOffset } from './index';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_PAUSE:
      if (state.desiredPlaySpeed === 0) {
        return state;
      }
      return {
        ...state,
        desiredPlaySpeed: 0,
      };
    case Types.ACTION_PLAY:
      // always a new object: the video component re-asserts play intent on
      // this change, which matters when autoplay was blocked (speed unchanged)
      return {
        ...state,
        desiredPlaySpeed: action.speed,
      };
    case Types.ACTION_LOOP: {
      const loop = (action.start !== null && action.start !== undefined
        && action.end !== null && action.end !== undefined)
        ? {
          startTime: action.start,
          duration: action.end - action.start,
        }
        : null;
      if (state.loop === loop || (state.loop && loop && state.loop.startTime === loop.startTime
        && state.loop.duration === loop.duration)) {
        return state;
      }
      return {
        ...state,
        loop,
      };
    }
    case Types.ACTION_BUFFER_VIDEO:
      if (state.isBufferingVideo === action.buffering) {
        return state;
      }
      return {
        ...state,
        isBufferingVideo: Boolean(action.buffering),
      };
    case Types.ACTION_PLAYING:
      if (state.isPlaying === action.playing) {
        return state;
      }
      return {
        ...state,
        isPlaying: Boolean(action.playing),
      };
    case Types.ACTION_RESET:
      return {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        isPlaying: false,
      };
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

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

// actual playing state reported by the video element
export function setPlaying(playing) {
  return {
    type: Types.ACTION_PLAYING,
    playing,
  };
}

export function resetPlayback() {
  // playback restarts from the beginning of the selection
  resetOffset(0);
  return {
    type: Types.ACTION_RESET,
  };
}
