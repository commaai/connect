import * as Types from '../actions/types';

function clampOffset(state, offset) {
  let start = Math.max(0, state.currentRoute?.videoStartOffset || 0);
  let end = Number.isFinite(state.currentRoute?.duration) ? state.currentRoute.duration : Infinity;
  if (state.loop && state.loop.duration > 0) {
    start = Math.max(start, state.loop.startTime);
    end = Math.min(end, state.loop.startTime + state.loop.duration);
  }
  return Math.max(start, Math.min(end, offset));
}

function seekState(state, offset) {
  return {
    ...state,
    offset: clampOffset(state, offset),
    seekVersion: (state.seekVersion || 0) + 1,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return Number.isFinite(action.offset) ? seekState(state, action.offset) : state;
    case Types.ACTION_VIDEO_PROGRESS:
      // A previous route or seek must not overwrite the latest requested position.
      if (action.routeFullname !== state.currentRoute?.fullname
        || action.seekVersion !== (state.seekVersion || 0)
        || !Number.isFinite(action.offset) || action.offset < 0 || action.offset === state.offset) {
        return state;
      }
      return { ...state, offset: action.offset };
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      return Number.isFinite(action.speed) && action.speed > 0
        ? { ...state, desiredPlaySpeed: Math.min(16, action.speed) } : state;
    case Types.ACTION_LOOP: {
      const loop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null;
      const next = { ...state, loop };
      const offset = clampOffset(next, state.offset ?? loop?.startTime ?? 0);
      return offset !== state.offset ? seekState(next, offset) : next;
    }
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, isBufferingVideo: Boolean(action.buffering) };
    case Types.ACTION_RESET:
      return seekState({ ...state, desiredPlaySpeed: 1, isBufferingVideo: true }, state.zoom?.start ?? 0);
    default:
      return state;
  }
}

export function seek(offset) {
  return { type: Types.ACTION_SEEK, offset };
}

export function videoProgress(offset, routeFullname, seekVersion) {
  return { type: Types.ACTION_VIDEO_PROGRESS, offset, routeFullname, seekVersion };
}

export function pause() {
  return { type: Types.ACTION_PAUSE };
}

export function play(speed = 1) {
  return { type: Types.ACTION_PLAY, speed };
}

export function selectLoop(start, end) {
  return { type: Types.ACTION_LOOP, start, end };
}

export function bufferVideo(buffering) {
  return { type: Types.ACTION_BUFFER_VIDEO, buffering };
}

export function resetPlayback() {
  return { type: Types.ACTION_RESET };
}
