import * as Types from '../actions/types';

export function reducer(state, action) {
  if (action.type !== Types.ACTION_LOOP) {
    return state;
  }

  const hasRange = action.start != null && action.end != null;
  if (!hasRange) {
    return { ...state, loop: null };
  }

  return {
    ...state,
    loop: {
      startTime: action.start,
      duration: action.end - action.start,
    },
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

export function videoPlayed(offset, speed) {
  return { type: Types.VIDEO_PLAYED, offset, speed };
}

export function videoPaused(offset, speed) {
  return { type: Types.VIDEO_PAUSED, offset, speed };
}

export function videoSeeked(offset, speed) {
  return { type: Types.VIDEO_SEEKED, offset, speed };
}
