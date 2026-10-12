// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';

function clampToLoop(offset, loop) {
  return loop ? Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration) : offset;
}

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = clampToLoop(action.offset, state.loop);
      state.seekRequest = { offset: state.offset };
      break;
    case Types.ACTION_VIDEO_PROGRESS:
      state.offset = action.offset;
      break;
    case Types.ACTION_PAUSE:
      state.isPlaying = false;
      break;
    case Types.ACTION_PLAY:
      state.isPlaying = true;
      break;
    case Types.ACTION_PLAYBACK_SPEED:
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
    case Types.ACTION_RESET:
      state = {
        ...state,
        isPlaying: true,
        desiredPlaySpeed: 1,
        offset: 0,
      };
      break;
    default:
      break;
  }

  // a null offset goes to the start of the selection
  state.offset = clampToLoop(state.offset, state.loop);

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// where the video has played to, never moves the video
export function videoProgress(offset) {
  return {
    type: Types.ACTION_VIDEO_PROGRESS,
    offset,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume the playback
export function play() {
  return {
    type: Types.ACTION_PLAY,
  };
}

// change play speed
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

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
