// Playback commands and the status of the drive video. The player middleware in
// `./index.js` runs the commands; the status comes from the video's own events and
// from DriveVideo when a load starts or fails.
import * as Types from '../actions/types';

export function statusOf(video) {
  if (video.ended) {
    return 'ended';
  }
  if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
    return 'loading';
  }
  if (video.paused) {
    return 'paused';
  }
  return video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 'buffering' : 'playing';
}

export function reducer(state, action) {
  const { playback } = state;
  switch (action.type) {
    case Types.ACTION_SET_RATE:
      return { ...state, playback: { ...playback, rate: action.rate } };
    case Types.ACTION_UPDATE_PLAYBACK: {
      // events from a failed video, or from its teardown, must not hide the error
      if (playback.status === 'error' && action.status !== 'loading') return state;
      const error = action.error ?? null;
      if (action.status === playback.status && error === playback.error) return state;
      return { ...state, playback: { ...playback, status: action.status, error } };
    }
    default:
      return state;
  }
}

export function mediaEvent(video) {
  return { type: Types.ACTION_UPDATE_PLAYBACK, status: statusOf(video) };
}

export function videoLoading() {
  return { type: Types.ACTION_UPDATE_PLAYBACK, status: 'loading' };
}

export function videoFailed(error) {
  return { type: Types.ACTION_UPDATE_PLAYBACK, status: 'error', error };
}

export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

export function play() {
  return {
    type: Types.ACTION_PLAY,
  };
}

// Whether the play button shows pause: the video plays or is about to.
export function isPlaying(status) {
  return status === 'loading' || status === 'playing' || status === 'buffering';
}

export function togglePlay(status) {
  return isPlaying(status) ? pause() : play();
}

export function setRate(rate) {
  return { type: Types.ACTION_SET_RATE, rate };
}
