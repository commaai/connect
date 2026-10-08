// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
//
// The video element is the clock. `offset` is the video's position published by
// DriveVideo; user actions (seek, play, pause, speed) are requests the video carries out.
import * as Types from '../actions/types';

export function clampToLoop(offset, loop) {
  if (!loop) {
    return offset;
  }
  return Math.max(loop.startTime, Math.min(offset, loop.startTime + loop.duration));
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      const offset = clampToLoop(action.offset, state.loop);
      return { ...state, offset, seekRequest: { offset } };
    }
    case Types.ACTION_VIDEO_PROGRESS:
      return { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, isPlaying: false };
    case Types.ACTION_PLAY:
      return { ...state, isPlaying: true };
    case Types.ACTION_PLAYBACK_SPEED:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP:
      return {
        ...state,
        loop: action.start != null && action.end != null
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      };
    case Types.ACTION_RESET: {
      const offset = state.loop?.startTime ?? 0;
      return {
        ...state,
        desiredPlaySpeed: 1,
        offset,
        seekRequest: { offset },
      };
    }
    default:
      return state;
  }
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// the video reached a new offset
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

// change play speed without changing play/pause state
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
