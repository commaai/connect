import * as Types from '../actions/types';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state = {
        ...state,
        offset: action.offset,
      };
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: state.offset,
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: state.offset,
          desiredPlaySpeed: action.speed,
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
        offset: state.offset,
      };
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        offset: 0,
      };
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

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
