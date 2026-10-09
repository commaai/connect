import * as Types from '../actions/types';

// Commands express user intent. Only media events advance the observed offset.
export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK: {
      if (!Number.isFinite(action.offset)) return state;
      const start = state.loop?.startTime ?? 0;
      const end = state.loop ? start + state.loop.duration : state.currentRoute?.duration ?? Infinity;
      return { ...state, seekRequest: { id: (state.seekRequest?.id || 0) + 1,
        fullname: state.currentRoute?.fullname, offset: Math.max(start, Math.min(end, action.offset)) } };
    }
    case Types.ACTION_SEEK_DONE:
      return state.seekRequest === action.request ? { ...state, seekRequest: null } : state;
    case Types.ACTION_VIDEO_TIME:
      if (action.fullname !== state.currentRoute?.fullname || !Number.isFinite(action.offset)) return state;
      return state.offset === action.offset ? state : { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return Number.isFinite(action.speed) && action.speed > 0
        ? { ...state, desiredPlaySpeed: Math.max(0.1, Math.min(16, action.speed)) } : state;
    case Types.ACTION_LOOP:
      return { ...state, loop: action.start != null && action.end != null
        ? { startTime: action.start, duration: action.end - action.start } : null };
    case Types.ACTION_BUFFER_VIDEO:
      return state.isBufferingVideo === Boolean(action.buffering) ? state : { ...state, isBufferingVideo: Boolean(action.buffering) };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, isBufferingVideo: true, offset: null, seekRequest: null };
    default:
      return state;
  }
}

export const seek = offset => ({ type: Types.ACTION_SEEK, offset });
export const videoTime = (fullname, offset) => ({ type: Types.ACTION_VIDEO_TIME, fullname, offset });
export const pause = () => ({ type: Types.ACTION_PAUSE });
export const play = (speed = 1) => ({ type: Types.ACTION_PLAY, speed });
export const selectLoop = (start, end) => ({ type: Types.ACTION_LOOP, start, end });
export const bufferVideo = buffering => ({ type: Types.ACTION_BUFFER_VIDEO, buffering });
export const resetPlayback = () => ({ type: Types.ACTION_RESET });

export const seekDone = request => ({ type: Types.ACTION_SEEK_DONE, request });
export const seekBy = amount => (dispatch, getState) => {
  const state = getState();
  const request = state.seekRequest;
  const offset = request && request.fullname === state.currentRoute?.fullname
    ? request.offset : state.offset ?? state.loop?.startTime ?? 0;
  dispatch(seek(offset + amount));
};
