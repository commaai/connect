import * as Types from '../actions/types';

function requestedSeek(state, offset) {
  const start = Math.max(state.loop?.startTime ?? 0, state.currentRoute?.videoStartOffset ?? 0);
  const end = state.loop ? state.loop.startTime + state.loop.duration : state.currentRoute?.duration ?? Infinity;
  return {
    offset: Math.max(start, Math.min(end, offset)),
    route: state.currentRoute?.fullname,
    id: (state.seekRequest?.id ?? 0) + 1,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return Number.isFinite(action.offset) ? { ...state, seekRequest: requestedSeek(state, action.offset) } : state;
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0, playRequest: (state.playRequest ?? 0) + 1 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed, playRequest: (state.playRequest ?? 0) + 1 };
    case Types.ACTION_LOOP: {
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null;
      const next = { ...state, loop };
      if (loop && (state.offset == null || state.offset < action.start || state.offset >= action.end)) {
        next.seekRequest = requestedSeek(next, action.start);
      }
      return next;
    }
    case Types.ACTION_MEDIA_STATE:
      // Old players may finish a seek, play promise, or HLS request after navigation.
      return action.route === state.currentRoute?.fullname ? { ...state, ...action.media } : state;
    case Types.ACTION_RESET:
      return {
        ...state,
        desiredPlaySpeed: 1,
        playRequest: (state.playRequest ?? 0) + 1,
        isPlaying: false,
        isBufferingVideo: true,
        offset: null,
        seekRequest: { offset: null, id: (state.seekRequest?.id ?? 0) + 1 },
      };
    default:
      return state;
  }
}

export const seek = (offset) => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
export const mediaState = (route, media) => ({ type: Types.ACTION_MEDIA_STATE, route, media });
