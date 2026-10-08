import * as Types from '../actions/types';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      return alignLoop({
        ...state,
        offset: clampToLoop(action.offset, state.loop),
        startTime: Date.now(),
      });
    case Types.ACTION_PAUSE:
      return { ...state, desiredPlaySpeed: 0 };
    case Types.ACTION_PLAY:
      if (action.speed === state.desiredPlaySpeed) return state;
      return { ...state, desiredPlaySpeed: action.speed };
    case Types.ACTION_LOOP:
      return alignLoop({
        ...state,
        loop: action.start != null && action.end != null
          ? { startTime: action.start, duration: action.end - action.start }
          : null,
      });
    case Types.ACTION_BUFFER_VIDEO:
      return { ...state, isBufferingVideo: Boolean(action.buffering) };
    case Types.ACTION_RESET:
      return {
        ...state,
        desiredPlaySpeed: 1,
        offset: 0,
        startTime: Date.now(),
      };
    default:
      return alignLoop(state);
  }
}

// The log can start before the first video frame. Skip that gap when the route arrives.
function alignLoop(state) {
  const videoStart = state.currentRoute?.videoStartOffset;
  const { loop, zoom } = state;
  if (!videoStart || !loop || !zoom || zoom.start !== 0 || loop.startTime !== zoom.start) return state;
  if (videoStart <= loop.startTime) return state;
  return {
    ...state,
    loop: {
      startTime: videoStart,
      duration: loop.duration - videoStart,
    },
  };
}

function clampToLoop(offset, loop) {
  if (!loop || loop.startTime == null || !loop.duration) return offset;
  const end = loop.startTime + loop.duration;
  if (offset < loop.startTime) return loop.startTime;
  if (offset > end) return end;
  return offset;
}

export function seek(offset) {
  return { type: Types.ACTION_SEEK, offset };
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
