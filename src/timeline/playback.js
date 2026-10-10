import * as Types from '../actions/types';
import { currentOffset } from '.';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_MEDIA_SOURCE:
      return { ...state, mediaSource: action.source, mediaPlaying: false, offset: currentOffset(state), startTime: Date.now() };
    case Types.ACTION_MEDIA_TIME:
      return action.source === state.mediaSource && action.revision === (state.seekRevision || 0)
        && Number.isFinite(action.offset) ? { ...state, offset: action.offset } : state;
    case Types.ACTION_MEDIA_PLAYING:
      return action.source === state.mediaSource ? { ...state, mediaPlaying: action.playing } : state;
    case Types.ACTION_SEEK: {
      if (!Number.isFinite(action.offset)) return state;
      const start = state.loop?.startTime ?? 0;
      const end = state.loop ? start + state.loop.duration : Infinity;
      const offset = Math.max(start, Math.min(end, action.offset));
      return { ...state, offset, seekOffset: offset, seekRevision: (state.seekRevision || 0) + 1, startTime: Date.now() };
    }
    case Types.ACTION_PAUSE:
    case Types.ACTION_PLAY:
      return { ...state, offset: currentOffset(state), startTime: Date.now(),
        desiredPlaySpeed: action.type === Types.ACTION_PAUSE ? 0 : action.speed };
    case Types.ACTION_LOOP:
      return { ...state, loop: action.start != null && action.end != null
        ? { startTime: action.start, duration: action.end - action.start } : null };
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, offset: currentOffset(state), startTime: Date.now(), isBufferingVideo: Boolean(action.buffering) };
    case Types.ACTION_RESET:
      return { ...state, desiredPlaySpeed: 1, isBufferingVideo: true, offset: 0, seekOffset: 0,
        seekRevision: (state.seekRevision || 0) + 1, startTime: Date.now() };
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

// Keep native play() in the user-activation task, even when React batches renders.
export const mediaMiddleware = ({ getState }) => {
  let player;
  return (next) => (action) => {
    if (action.type === Types.ACTION_BIND_MEDIA) {
      player = action.player;
      const bound = player;
      return () => { if (player === bound) player = null; };
    }
    const result = next(action);
    if ([Types.ACTION_SEEK, Types.ACTION_PLAY, Types.ACTION_PAUSE, Types.ACTION_LOOP, Types.ACTION_RESET].includes(action.type)) {
      player?.update({ ...getState(), activate: action.type === Types.ACTION_PLAY });
    }
    return result;
  };
};
