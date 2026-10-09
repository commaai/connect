import * as Types from '../actions/types';

// Commands carry a revision; observations never become new seek commands.
export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      if (!Number.isFinite(action.offset)) return state;
      const start = Math.max(state.loop?.startTime ?? 0, state.currentRoute?.videoStartOffset ?? 0);
      const end = state.loop ? state.loop.startTime + state.loop.duration : state.currentRoute?.duration ?? Infinity;
      const offset = Math.max(start, Math.min(end, action.offset));
      return { ...state, offset, seekRevision: (state.seekRevision ?? 0) + 1 };
    }
    case Types.ACTION_MEDIA_POSITION:
      if (!Number.isFinite(action.offset) || action.route !== state.currentRoute?.fullname || action.revision !== (state.seekRevision ?? 0)) return state;
      return { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP: {
      const start = Math.max(action.start ?? 0, state.currentRoute?.videoStartOffset ?? 0);
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > start
        ? { startTime: start, duration: action.end - start } : null;
      return { ...state, loop };
    }
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, isBufferingVideo: Boolean(action.buffering) };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, isBufferingVideo: true,
        offset: Math.max(state.zoom?.start ?? 0, state.currentRoute?.videoStartOffset ?? 0),
        seekRevision: (state.seekRevision ?? 0) + 1 };
    default:
      return state;
  }
}

export const seek = offset => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const bufferVideo = buffering => ({ type: Types.ACTION_BUFFER_VIDEO, buffering });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
export const observePosition = (route, revision, offset) => ({ type: Types.ACTION_MEDIA_POSITION, route, revision, offset });
