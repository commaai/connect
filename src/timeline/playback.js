// basic helper functions for controlling playback
// the <video> holds the playback state, the store only mirrors what the controls draw
import * as Types from '../actions/types';
import { loopVideo, seekVideo, video } from '.';

export function reducer(state, action) {
  if (action.type !== Types.ACTION_VIDEO_STATE) {
    return state;
  }
  return {
    ...state,
    isPaused: action.isPaused,
    playSpeed: action.playSpeed,
    isBufferingVideo: action.isBufferingVideo,
  };
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch, getState) => {
    seekVideo(offset, getState());
    loopVideo(getState());
    dispatch({ type: Types.ACTION_SEEK });
  };
}

// pause the playback
export function pause() {
  return (dispatch) => {
    video.pause();
    dispatch({ type: Types.ACTION_PAUSE });
  };
}

// resume / change play speed
export function play(speed = video.playbackRate) {
  return (dispatch) => {
    video.playbackRate = speed;
    video.play().catch(() => {}); // refused or interrupted: the video stays paused
    dispatch({ type: Types.ACTION_PLAY });
  };
}

// what the video reports about itself, sent on each of its state events
export function videoState({ paused, playbackRate, readyState, seeking }) {
  return {
    type: Types.ACTION_VIDEO_STATE,
    isPaused: paused,
    playSpeed: playbackRate,
    isBufferingVideo: !paused && (seeking || readyState < 3), // playing, but without the next frame
  };
}
