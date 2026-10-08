// basic helper functions for controlling playback
// commands act on the video element synchronously so they keep the user gesture ios needs to play
import * as Types from '../actions/types';
import { activeVideo, pastVideoEnd, seekTo, setClockSpeed } from '.';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return { ...state, seekCount: state.seekCount + 1 };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
    case Types.ACTION_SYNC_PLAYBACK:
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP: {
      const loop = action.start != null && action.end != null
        ? { startTime: action.start, duration: action.end - action.start }
        : null;
      return { ...state, loop };
    }
    default:
      return state;
  }
}

// play state changed by the element itself (lock screen, headset, refused autoplay),
// kept apart from ACTION_PLAY/ACTION_PAUSE so analytics only counts user intents
export function syncPlayback(speed) {
  return (dispatch, getState) => {
    setClockSpeed(speed);
    if (getState().desiredPlaySpeed !== speed) dispatch({ type: Types.ACTION_SYNC_PLAYBACK, speed });
  };
}

function playVideo(dispatch, speed) {
  setClockSpeed(speed);
  const video = activeVideo();
  // play() would restart a video at its end from 0, the clock plays on until the loop restarts
  if (!video || pastVideoEnd()) return;
  if (video.playbackRate !== speed) video.playbackRate = speed;
  video.play().catch((err) => {
    if (err.name === 'NotAllowedError' && video === activeVideo()) dispatch(syncPlayback(0));
  });
}

// seek to a specific offset
export function seek(offset) {
  return (dispatch) => {
    const wasPastEnd = pastVideoEnd();
    seekTo(offset);
    dispatch({ type: Types.ACTION_SEEK });
    // an element left at its end stays paused when seeked back into its range
    if (wasPastEnd && !pastVideoEnd()) dispatch(resumePlayback());
  };
}

// pause the playback
export function pause() {
  return (dispatch) => {
    setClockSpeed(0);
    activeVideo()?.pause();
    dispatch({ type: Types.ACTION_PAUSE });
  };
}

// resume / change play speed
export function play(speed = 1) {
  return (dispatch) => {
    playVideo(dispatch, speed);
    dispatch({ type: Types.ACTION_PLAY, speed });
  };
}

// start a newly loaded element if the user wants playback
export function resumePlayback() {
  return (dispatch, getState) => {
    const { desiredPlaySpeed } = getState();
    if (desiredPlaySpeed) playVideo(dispatch, desiredPlaySpeed);
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
  return (dispatch) => {
    playVideo(dispatch, 1);
    dispatch({ type: Types.ACTION_RESET, speed: 1 });
  };
}
