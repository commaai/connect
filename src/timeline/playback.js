// playback commands act on the drive's <video> element; the element's own
// events report back what it is doing through videoState
import * as Types from '../actions/types';
import { clockSpeed, currentOffset, getVideo, runClock, seekTo } from '.';

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
  return (dispatch) => {
    seekTo(offset);
    dispatch({ type: Types.ACTION_SEEK, offset: currentOffset() });
  };
}

// pause the playback
export function pause() {
  return (dispatch) => {
    const video = getVideo();
    if (runClock(0)) {
      dispatch(videoState(video));
    } else {
      video?.pause();
    }
    dispatch({ type: Types.ACTION_PAUSE, offset: currentOffset() });
  };
}

// resume / change play speed
export function play(speed) {
  return (dispatch) => {
    const video = getVideo();
    if (video) {
      if (speed) {
        video.defaultPlaybackRate = speed;
        video.playbackRate = speed;
      }
      if (runClock(video.playbackRate)) {
        dispatch(videoState(video));
      } else {
        // a refused play() just leaves the video paused
        video.play().catch(() => {});
      }
    }
    dispatch({ type: Types.ACTION_PLAY, offset: currentOffset(), speed: speed || video?.playbackRate || 1 });
  };
}

// what the video element, or the clock standing in for a failed one, is doing
export function videoState(video) {
  const speed = clockSpeed();
  if (speed !== null) {
    return { type: Types.ACTION_VIDEO_STATE, isPaused: speed === 0, playSpeed: video.playbackRate, isBufferingVideo: false };
  }
  return {
    type: Types.ACTION_VIDEO_STATE,
    isPaused: video.paused,
    playSpeed: video.playbackRate,
    isBufferingVideo: video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA),
  };
}
