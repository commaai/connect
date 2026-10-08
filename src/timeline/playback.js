// Playback actions. They act on the <video> element directly, and the video's
// own events report back what actually happened (see DriveVideo).
import * as Types from '../actions/types';
import { getVideo } from '.';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return { ...state, offset: action.offset };
    case Types.ACTION_LOOP:
      return {
        ...state,
        loop: action.start != null && action.end != null
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      };
    case Types.ACTION_VIDEO_STATE:
      return { ...state, isPlaying: action.isPlaying, playSpeed: action.playSpeed };
    default:
      return state;
  }
}

// move the video to an offset, kept inside the selection and after the first
// video frame. Returns the offset it moved to.
function seekVideo({ currentRoute, loop }, offset) {
  const videoStartOffset = currentRoute?.videoStartOffset || 0;
  if (loop) {
    offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
  }
  offset = Math.max(offset, videoStartOffset);

  const video = getVideo();
  if (video?.readyState >= HTMLMediaElement.HAVE_METADATA) {
    video.currentTime = (offset - videoStartOffset) / 1000;
  }
  return offset;
}

// seek to an offset in milliseconds from the start of the route
export function seek(offset) {
  return (dispatch, getState) => {
    dispatch({ type: Types.ACTION_SEEK, offset: seekVideo(getState(), offset) });
  };
}

// a video that just loaded starts at the last seek, or the start of the selection
export function restoreOffset() {
  return (_, getState) => {
    const state = getState();
    seekVideo(state, state.offset ?? state.loop?.startTime ?? 0);
  };
}

// start playing, optionally at a new speed
export function play(speed) {
  return (dispatch) => {
    const video = getVideo();
    if (video) {
      if (speed) {
        video.playbackRate = speed;
      }
      // rejects if autoplay is blocked or a pause interrupts it. The video's
      // play and pause events keep the UI correct either way.
      video.play().catch(() => {});
    }
    dispatch({ type: Types.ACTION_PLAY, speed });
  };
}

export function pause() {
  return (dispatch) => {
    getVideo()?.pause();
    dispatch({ type: Types.ACTION_PAUSE });
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

// mirror the video's play state into the store
export function videoStateChanged(video) {
  return {
    type: Types.ACTION_VIDEO_STATE,
    isPlaying: !video.paused,
    playSpeed: video.playbackRate,
  };
}
