import * as Types from '../actions/types';

export function reducer(state, action) {
  if (action.type !== Types.ACTION_LOOP) return state;

  const hasRange = action.start != null && action.end != null;
  if (!hasRange) return { ...state, loop: null };

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

export function videoPlayed(routeMs, speed) {
  return { type: Types.ACTION_VIDEO_PLAY, offset: routeMs, speed };
}

export function videoPaused(routeMs, speed) {
  return { type: Types.ACTION_VIDEO_PAUSE, offset: routeMs, speed };
}

export function videoSeeked(routeMs, speed) {
  return { type: Types.ACTION_VIDEO_SEEK, offset: routeMs, speed };
}
