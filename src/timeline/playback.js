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
    case Types.ACTION_PLAYBACK_SPEED:
      state = {
        ...state,
        desiredPlaySpeed: action.speed,
      };
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

// change playback speed without changing play/pause state
export function setPlaybackSpeed(speed) {
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
