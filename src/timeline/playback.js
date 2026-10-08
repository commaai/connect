import * as Types from '../actions/types';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      if (!Number.isFinite(action.offset)) return state;
      const start = state.loop?.startTime ?? 0;
      const end = state.loop ? start + state.loop.duration : state.currentRoute?.duration ?? Infinity;
      return { ...state, offset: Math.max(start, Math.min(end, action.offset)), seekRevision: (state.seekRevision ?? 0) + 1 };
    }
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return { ...state, desiredPlaySpeed: action.speed, playbackRate: action.speed };
    case Types.ACTION_LOOP:
      return { ...state, loop: action.start != null && action.end != null
        ? { startTime: action.start, duration: Math.max(0, action.end - action.start) } : null };
    case Types.ACTION_MEDIA_STATE:
      if (action.fullname !== state.currentRoute?.fullname) return state;
      return { ...state, ...action.playback };
    case Types.ACTION_RESET:
      return { ...state, offset: state.zoom?.start ?? 0, desiredPlaySpeed: 1, isBufferingVideo: true };
    default:
      return state;
  }
}

export const seek = (offset) => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
export const mediaState = (fullname, playback) => ({ type: Types.ACTION_MEDIA_STATE, fullname, playback });

const ATTACH_PLAYER = 'ATTACH_PLAYER';
export const attachPlayer = (player) => ({ type: ATTACH_PLAYER, player });

// Invoke media commands in the dispatching gesture, including on iOS. The
// controller belongs to this store and is never placed in serializable state.
export const playbackMiddleware = ({ getState }) => {
  let player;
  return (next) => (action) => {
    if (action.type === ATTACH_PLAYER) {
      player = action.player;
      player(action, getState());
      return () => { if (player === action.player) player = null; };
    }
    const result = next(action);
    player?.(action, getState());
    return result;
  };
};
