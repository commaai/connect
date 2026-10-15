// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      const { loop } = state;
      const offset = loop
        ? Math.min(Math.max(action.offset, loop.startTime), loop.startTime + loop.duration)
        : action.offset;
      return { ...state, offset, seekRequest: { offset } };
    }
    case Types.ACTION_VIDEO_PROGRESS:
      // ignore progress from before the video applied the latest seek
      return action.seekRequest === state.seekRequest ? { ...state, offset: action.offset } : state;
    case Types.ACTION_PAUSE:
      return { ...state, isPlaying: false };
    case Types.ACTION_PLAY:
      return { ...state, isPlaying: true };
    case Types.ACTION_PLAYBACK_SPEED:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP: {
      const loop = action.start != null && action.end != null
        ? { startTime: action.start, duration: action.end - action.start }
        : null;
      if (!loop || (state.offset >= action.start && state.offset <= action.end)) {
        return { ...state, loop };
      }
      return { ...state, loop, offset: action.start, seekRequest: { offset: action.start } };
    }
    case Types.ACTION_RESET:
      return { ...state, offset: state.loop?.startTime ?? 0, seekRequest: null, isPlaying: true, desiredPlaySpeed: 1 };
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

export function seekBy(amount) {
  return (dispatch, getState) => dispatch(seek(getState().offset + amount));
}

export function videoProgress(offset, seekRequest) {
  return {
    type: Types.ACTION_VIDEO_PROGRESS,
    offset,
    seekRequest,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume playback
export function play() {
  return {
    type: Types.ACTION_PLAY,
  };
}

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
