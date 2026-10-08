// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { currentOffset } from '.';
import { playbackRange } from './video';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK: {
      // seeks stay within the selected range
      const range = playbackRange(state.loop, state.zoom);
      state = {
        ...state,
        offset: range ? Math.min(Math.max(action.offset, range.start), range.end) : action.offset,
        startTime: Date.now(),
      };
      break;
    }
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: currentOffset(state),
        startTime: Date.now(),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: currentOffset(state),
          desiredPlaySpeed: action.speed,
          startTime: Date.now(),
        };
      }
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
    case Types.ACTION_BUFFER_VIDEO:
      state = {
        ...state,
        isBufferingVideo: action.buffering,
        offset: currentOffset(state),
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_RANGE_LOOPING:
      state.rangeLooping = action.enabled;
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

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

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

// whether a selected range repeats, or plays once and returns to where playback was before
export function setRangeLooping(enabled) {
  return {
    type: Types.ACTION_RANGE_LOOPING,
    enabled,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
