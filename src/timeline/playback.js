// Playback is driven by the video element (see ./player). These actions control
// the video; the video reports its state back through updateVideoState.
import * as Types from '../actions/types';
import * as player from './player';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
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
    case Types.ACTION_VIDEO_STATE:
      state = {
        ...state,
        ...action.videoState,
      };
      break;
    default:
      break;
  }

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch) => {
    player.seek(offset);
    dispatch({ type: Types.ACTION_SEEK, offset: player.getOffset() });
  };
}

// pause the playback
export function pause() {
  return (dispatch) => {
    player.pause();
    dispatch({ type: Types.ACTION_PAUSE });
  };
}

// resume playback
export function play() {
  return (dispatch) => {
    player.play();
    dispatch({ type: Types.ACTION_PLAY });
  };
}

export function setPlaySpeed(speed) {
  return () => {
    player.setPlaySpeed(speed);
  };
}

// play only this section of the route, from its start
export function selectLoop(start, end) {
  return (dispatch) => {
    player.setLoop(start, end);
    dispatch({ type: Types.ACTION_LOOP, start, end });
  };
}

// state reported by the video element: isPaused, playSpeed, isBufferingVideo
export function updateVideoState(videoState) {
  return {
    type: Types.ACTION_VIDEO_STATE,
    videoState,
  };
}

export function resetPlayback() {
  return () => {
    player.setPlaySpeed(1);
    player.play();
  };
}
