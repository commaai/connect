import * as Types from '../actions/types';

export const VideoStatus = {
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
};

function clampToLoop(offset, loop) {
  if (!loop) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
}

// The video is the clock: it reports its position as progress, and everything
// else asks it to move with a seek. Seeks are commands for the video, progress
// is only a report, so the video never seeks in response to its own progress.
export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      const offset = clampToLoop(action.offset, state.loop);
      return { ...state, offset, seekRequest: { offset } };
    }
    case Types.ACTION_VIDEO_PROGRESS:
      return { ...state, offset: action.offset };
    case Types.ACTION_PLAYBACK_SPEED:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_PLAY:
      return { ...state, isPlaying: true };
    case Types.ACTION_PAUSE:
      return { ...state, isPlaying: false };
    case Types.ACTION_LOOP:
      return {
        ...state,
        loop: action.start != null && action.end != null
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      };
    case Types.ACTION_RESET:
      return {
        ...state,
        offset: state.loop?.startTime ?? 0,
        seekRequest: null,
        desiredPlaySpeed: 1,
        isPlaying: true,
        hasAudio: false,
        videoStatus: VideoStatus.LOADING,
      };
    case Types.ACTION_HAS_AUDIO:
      return { ...state, hasAudio: action.hasAudio };
    case Types.ACTION_VIDEO_STATUS:
      return { ...state, videoStatus: action.status };
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

// seek relative to the current position
export function seekBy(amount) {
  return (dispatch, getState) => dispatch(seek(getState().offset + amount));
}

export function videoProgress(offset) {
  return {
    type: Types.ACTION_VIDEO_PROGRESS,
    offset,
  };
}

// change playback speed without changing play/pause state
export function setPlaybackSpeed(speed) {
  return {
    type: Types.ACTION_PLAYBACK_SPEED,
    speed,
  };
}

export function play() {
  return {
    type: Types.ACTION_PLAY,
  };
}

export function pause() {
  return {
    type: Types.ACTION_PAUSE,
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

export function setHasAudio(hasAudio) {
  return {
    type: Types.ACTION_HAS_AUDIO,
    hasAudio,
  };
}

export function setVideoStatus(status) {
  return {
    type: Types.ACTION_VIDEO_STATUS,
    status,
  };
}
