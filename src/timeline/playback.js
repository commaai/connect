// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { getVideo, videoTime } from '.';

export function reducer(_state, action) {
  const state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state.offset = action.offset;
      if (state.loop) {
        if (state.offset < state.loop.startTime) {
          state.offset = state.loop.startTime;
        } else if (state.offset > state.loop.startTime + state.loop.duration) {
          state.offset = state.loop.startTime + state.loop.duration;
        }
      }
      break;
    case Types.ACTION_PAUSE:
      state.isPlaying = false;
      state.offset = action.offset;
      break;
    case Types.ACTION_PLAY:
      state.isPlaying = true;
      state.offset = action.offset;
      break;
    case Types.ACTION_PLAYBACK_SPEED:
      state.desiredPlaySpeed = action.speed;
      break;
    case Types.ACTION_LOOP:
      if (action.start != null && action.end != null) {
        state.loop = { startTime: action.start, duration: action.end - action.start };
      } else {
        state.loop = null;
      }
      break;
    case Types.ACTION_RESET:
      state.desiredPlaySpeed = 1;
      state.isPlaying = false;
      state.offset = null;
      break;
    default:
      break;
  }
  return state;
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch, getState) => {
    dispatch({
      type: Types.ACTION_SEEK,
      offset,
    });

    const video = getVideo();
    if (video) {
      const state = getState();
      video.currentTime = videoTime(state.currentRoute, state.offset);
    }
  };
}

// pause the playback
export function pause() {
  return () => {
    const video = getVideo();
    if (video) {
      video.pause();
    }
  };
}

// resume the playback
export function play() {
  return () => {
    const video = getVideo();
    if (video) {
      video.play().catch(() => {});
    }
  };
}

export function setPlaybackSpeed(speed) {
  return (dispatch) => {
    dispatch({
      type: Types.ACTION_PLAYBACK_SPEED,
      speed,
    });

    const video = getVideo();
    if (video) {
      video.defaultPlaybackRate = speed;
      video.playbackRate = speed;
    }
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

export function videoPlayed(offset) {
  return {
    type: Types.ACTION_PLAY,
    offset,
  };
}

export function videoPaused(offset) {
  return {
    type: Types.ACTION_PAUSE,
    offset,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
