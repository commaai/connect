// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';

function clampToLoop(offset, loop) {
  return loop ? Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration) : offset;
}

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK: {
      const offset = clampToLoop(action.offset, state.loop);
      state = {
        ...state,
        offset,
        seekRequest: { offset },
      };
      break;
    }
    case Types.ACTION_VIDEO_PROGRESS:
      state = {
        ...state,
        offset: action.offset,
      };
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        isPlaying: false,
      };
      break;
    case Types.ACTION_PLAY:
      state = {
        ...state,
        isPlaying: true,
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

  // keep the offset inside the selection (a null offset starts at its start)
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

// pause the playback, auto ones aren't logged
export function pause(auto = false) {
  return {
    type: Types.ACTION_PAUSE,
    auto,
  };
}

// resume the playback
export function play(auto = false) {
  return {
    type: Types.ACTION_PLAY,
    auto,
  };
}

// change play speed
export function setPlaybackSpeed(speed, auto = false) {
  return {
    type: Types.ACTION_PLAYBACK_SPEED,
    speed,
    auto,
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
