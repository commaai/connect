import * as Types from '../actions/types';

function clamp(state, offset) {
  if (!Number.isFinite(offset)) return null;
  const start = state.loop?.startTime ?? 0;
  const end = state.loop ? start + state.loop.duration : Infinity;
  return Math.min(end, Math.max(start, offset));
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_MEDIA_SOURCE:
      return { ...state, mediaSource: action.source };
    case Types.ACTION_MEDIA_PROGRESS: {
      if (action.source !== state.mediaSource || action.revision !== (state.seekRevision || 0)
        || !Number.isFinite(action.offset) || action.offset < 0) return state;
      return action.offset === state.offset ? state : { ...state, offset: action.offset };
    }
    case Types.ACTION_SEEK: {
      const offset = clamp(state, action.offset);
      if (offset === null) return state;
      return { ...state, offset, seekOffset: offset, seekRevision: (state.seekRevision || 0) + 1 };
    }
    case Types.ACTION_PLAY:
      return Number.isFinite(action.speed) && action.speed >= 0
        ? { ...state, desiredPlaySpeed: Math.min(16, action.speed) } : state;
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_LOOP:
      return { ...state, loop: Number.isFinite(action.start) && Number.isFinite(action.end)
        && action.start >= 0 && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null };
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, isBufferingVideo: !!action.buffering };
    case Types.ACTION_RESET: {
      const offset = state.zoom?.start ?? 0;
      return { ...state, offset, seekOffset: offset, seekRevision: (state.seekRevision || 0) + 1,
        desiredPlaySpeed: 1, isBufferingVideo: true };
    }
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
export const mediaSource = (source) => ({ type: Types.ACTION_MEDIA_SOURCE, source });
export const progress = (source, revision, offset) => ({ type: Types.ACTION_MEDIA_PROGRESS, source, revision, offset });
