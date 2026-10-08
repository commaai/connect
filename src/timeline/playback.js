// basic helper functions for controlling playback
// the video is the clock, see index.js. the state only holds what the user asked for:
// a speed, a loop, and the offset of the last seek
import * as Types from '../actions/types';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = action.offset;
      state.seekId += 1;
      break;
    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;
    case Types.ACTION_PLAY:
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
    case Types.ACTION_BUFFER_VIDEO:
      state.isBufferingVideo = Boolean(action.buffering);
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        seekId: state.seekId + 1,
      };
      break;
    default:
      break;
  }

  // the video starts later than the logs, the loop can't start before the video does
  if (state.currentRoute && state.currentRoute.videoStartOffset && state.loop && state.zoom
    && state.loop.startTime === state.zoom.start && state.zoom.start === 0) {
    state.loop = {
      startTime: state.currentRoute.videoStartOffset,
      duration: state.loop.duration - state.currentRoute.videoStartOffset,
    };
  }

  // a seek stays inside the loop
  if (state.offset !== null && state.loop?.duration) {
    const { startTime, duration } = state.loop;
    state.offset = Math.min(Math.max(state.offset, startTime), startTime + duration);
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

// the video is waiting for data
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
