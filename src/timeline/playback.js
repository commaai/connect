import * as Types from '../actions/types';

function requestSeek(state, offset) {
  if (!Number.isFinite(offset)) return state;
  const start = Math.max(0, state.currentRoute?.videoStartOffset || 0, state.loop?.startTime ?? 0);
  const end = state.loop ? state.loop.startTime + state.loop.duration : state.currentRoute?.duration ?? Infinity;
  return {
    ...state,
    seekOffset: Math.max(start, Math.min(end, offset)),
    seekRevision: (state.seekRevision || 0) + 1,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return requestSeek(state, action.offset);
    case Types.ACTION_PAUSE:
      return { ...state, isPlaying: false };
    case Types.ACTION_PLAY:
      return action.speed === undefined ? { ...state, isPlaying: true }
        : Number.isFinite(action.speed) && action.speed > 0
          ? { ...state, isPlaying: true, desiredPlaySpeed: Math.min(8, action.speed) } : state;
    case Types.ACTION_SET_PLAY_SPEED:
      return Number.isFinite(action.speed) && action.speed > 0
        ? { ...state, desiredPlaySpeed: Math.min(8, action.speed) } : state;
    case Types.ACTION_LOOP: {
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null;
      const next = { ...state, loop };
      return loop ? requestSeek(next, state.offset ?? state.seekOffset ?? loop.startTime) : next;
    }
    case Types.ACTION_RESET:
      return requestSeek({ ...state, offset: null, desiredPlaySpeed: 1, isPlaying: true }, state.zoom?.start ?? 0);
    case Types.ACTION_VIDEO_POSITION:
      // A replaced route or superseded seek cannot publish its old position.
      if (action.fullname !== state.currentRoute?.fullname || action.seekRevision !== (state.seekRevision || 0)
        || !Number.isFinite(action.offset)) return state;
      return { ...state, offset: action.offset };
    default:
      return state;
  }
}

export const seek = (offset) => ({ type: Types.ACTION_SEEK, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const setPlaySpeed = (speed) => ({ type: Types.ACTION_SET_PLAY_SPEED, speed });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });
export const videoPosition = (fullname, offset, seekRevision = 0) => ({
  type: Types.ACTION_VIDEO_POSITION, fullname, offset, seekRevision,
});
