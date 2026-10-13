// basic helper functions for controlling playback
// the video element plays, the store only keeps the loop and reports the rest to analytics
import * as Types from '../actions/types';
import { media } from './media';

export function reducer(state, action) {
  let { loop } = state;
  if (action.type === Types.ACTION_LOOP) {
    loop = action.start != null && action.end != null
      ? { startTime: action.start, duration: action.end - action.start }
      : null;
  }

  // a loop over the whole route begins at its first video frame, known once its events load
  const videoStart = state.currentRoute?.videoStartOffset;
  if (loop?.startTime === 0 && state.zoom?.start === 0 && videoStart > 0) {
    loop = { startTime: videoStart, duration: Math.max(0, loop.duration - videoStart) };
  }

  return loop === state.loop ? state : { ...state, loop };
}

function clampToLoop(offset, loop) {
  if (!loop?.duration) return offset;
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
}

function playbackAction(type) {
  return { type, offset: media.currentOffset(), speed: media.intent.playbackRate };
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch, getState) => {
    media.seek(clampToLoop(offset, getState().loop));
    dispatch(playbackAction(Types.ACTION_SEEK));
  };
}

// pause the playback
export function pause() {
  return (dispatch) => {
    media.pause();
    dispatch(playbackAction(Types.ACTION_PAUSE));
  };
}

// resume / change play speed
export function play(speed) {
  return (dispatch) => {
    media.play(speed);
    dispatch(playbackAction(Types.ACTION_PLAY));
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

// a new timeline range plays from its start at normal speed
export function resetPlayback(offset) {
  return () => {
    media.seek(offset);
    media.play(1);
  };
}
