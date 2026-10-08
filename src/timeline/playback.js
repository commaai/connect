import * as Types from '../actions/types';

function clampOffset(state, offset) {
  const start = Math.max(state.loop?.startTime ?? 0, state.currentRoute?.videoStartOffset ?? 0);
  const end = state.loop ? state.loop.startTime + state.loop.duration : state.currentRoute?.duration ?? Infinity;
  return Math.max(start, Math.min(end, offset));
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      if (!Number.isFinite(action.offset)) return state;
      return { ...state, offset: clampOffset(state, action.offset), seekVersion: (state.seekVersion ?? 0) + 1 };
    case Types.ACTION_VIDEO_PROGRESS:
      // A late event from an old route must not move the new route's timeline.
      if (action.route !== state.currentRoute?.fullname || !Number.isFinite(action.offset)
        || action.seekVersion !== state.seekVersion) return state;
      return { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP: {
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null;
      const next = { ...state, loop };
      return { ...next, offset: clampOffset(next, state.offset ?? action.start ?? 0), seekVersion: (state.seekVersion ?? 0) + 1 };
    }
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, isBufferingVideo: action.buffering };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, isBufferingVideo: true,
        offset: clampOffset(state, state.zoom?.start ?? 0), seekVersion: (state.seekVersion ?? 0) + 1 };
    default:
      return state;
  }
}

export const seek = (offset) => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const bufferVideo = (buffering) => ({ type: Types.ACTION_BUFFER_VIDEO, buffering });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
export const videoProgress = (route, offset, seekVersion = 0) => ({ type: Types.ACTION_VIDEO_PROGRESS, route, offset, seekVersion });
