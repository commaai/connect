import * as Types from '../actions/types';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      if (!Number.isFinite(action.offset)) return state;
      const start = state.loop?.startTime ?? 0;
      const end = state.loop ? start + state.loop.duration : (state.currentRoute?.duration ?? Infinity);
      return { ...state, offset: Math.max(start, Math.min(end, action.offset)), seekRevision: (state.seekRevision || 0) + 1 };
    }
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return Number.isFinite(action.speed) && action.speed > 0
        ? { ...state, desiredPlaySpeed: Math.max(0.1, Math.min(8, action.speed)) } : state;
    case Types.ACTION_LOOP: {
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null;
      const offset = loop ? Math.max(loop.startTime, Math.min(action.end, state.offset ?? loop.startTime)) : state.offset;
      return { ...state, loop, offset, seekRevision: (state.seekRevision || 0) + 1 };
    }
    case Types.ACTION_VIDEO_PROGRESS:
      return { ...state, offset: action.offset };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, offset: null, seekRevision: (state.seekRevision || 0) + 1 };
    default:
      return state;
  }
}

export const seek = (offset) => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const videoProgress = (offset) => ({ type: Types.ACTION_VIDEO_PROGRESS, offset });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
