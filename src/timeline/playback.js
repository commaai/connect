import * as Types from '../actions/types';

/** Route-relative seek bounds, including the first available camera frame. */
export function playbackBounds(state) {
  const cameraOffset = state.currentRoute?.videoStartOffset;
  const videoStart = Number.isFinite(cameraOffset) ? Math.max(0, cameraOffset) : 0;
  const routeEnd = Number.isFinite(state.currentRoute?.duration)
    ? Math.max(videoStart, state.currentRoute.duration) : Infinity;
  const loop = state.loop;
  const hasLoop = Number.isFinite(loop?.startTime) && Number.isFinite(loop?.duration) && loop.duration >= 0;
  const start = hasLoop ? Math.max(videoStart, loop.startTime) : videoStart;
  const end = hasLoop ? Math.min(routeEnd, loop.startTime + loop.duration) : routeEnd;
  return { start, end: Math.max(start, end) };
}

function requestSeek(state, offset) {
  if (!Number.isFinite(offset)) {
    return state;
  }
  const { start, end } = playbackBounds(state);
  return {
    ...state,
    seekRequest: {
      id: (state.seekRequest?.id ?? 0) + 1,
      offset: Math.max(start, Math.min(end, offset)),
    },
  };
}

function normalizeLoop(state) {
  if (!state.loop) {
    return state;
  }
  if (!Number.isFinite(state.loop.startTime) || !Number.isFinite(state.loop.duration) || state.loop.duration < 0) {
    return { ...state, loop: null };
  }
  const { start, end } = playbackBounds(state);
  if (state.loop.startTime === start && state.loop.duration === end - start) {
    return state;
  }
  return { ...state, loop: { startTime: start, duration: end - start } };
}

export function reducer(_state, action) {
  let state = _state;
  const route = state.currentRoute?.fullname ?? null;
  if (route !== (state.playbackRoute ?? null)) {
    const zoom = state.zoom;
    state = {
      ...state,
      playbackRoute: route,
      offset: null,
      isBufferingVideo: Boolean(route),
      loop: route && Number.isFinite(zoom?.start) && Number.isFinite(zoom?.end) && zoom.end > zoom.start
        ? { startTime: zoom.start, duration: zoom.end - zoom.start } : null,
    };
    state = requestSeek(normalizeLoop(state), zoom?.start ?? 0);
  }

  switch (action.type) {
    case Types.ACTION_SEEK:
      state = requestSeek(state, action.offset);
      break;
    case Types.ACTION_VIDEO_TIME:
      // A previous source may still emit a final event after a route switch.
      if (route && action.fullname === route && Number.isFinite(action.offset) && state.offset !== Math.max(0, action.offset)) {
        state = { ...state, offset: Math.max(0, action.offset) };
      }
      break;
    case Types.ACTION_PAUSE:
      state = { ...state, desiredPlaySpeed: 0 };
      break;
    case Types.ACTION_PLAY:
      if (Number.isFinite(action.speed) && action.speed > 0) {
        state = { ...state, desiredPlaySpeed: action.speed };
      }
      break;
    case Types.ACTION_LOOP: {
      const hasLoop = Number.isFinite(action.start) && Number.isFinite(action.end) && action.end > action.start;
      state = normalizeLoop({
        ...state,
        loop: hasLoop ? { startTime: action.start, duration: action.end - action.start } : null,
      });
      const { start, end } = playbackBounds(state);
      const position = state.offset ?? state.seekRequest?.offset ?? start;
      if (position < start || position > end) {
        state = requestSeek(state, position);
      }
      break;
    }
    case Types.ACTION_BUFFER_VIDEO:
      state = { ...state, isBufferingVideo: Boolean(action.buffering) };
      break;
    case Types.ACTION_RESET:
      state = requestSeek({
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: Boolean(route),
      }, state.zoom?.start ?? state.loop?.startTime ?? 0);
      break;
    default:
      break;
  }

  // Camera timing can arrive after the player and the initial seek request.
  state = normalizeLoop(state);
  if (state.loop?.duration === 0 && state.desiredPlaySpeed !== 0) {
    state = { ...state, desiredPlaySpeed: 0 };
  }
  const { start, end } = playbackBounds(state);
  const position = state.offset ?? state.seekRequest?.offset;
  if (action.type === Types.ACTION_UPDATE_ROUTE_EVENTS && route && action.fullname === route && Number.isFinite(position)
      && (position < start || position > end)) {
    // A seek may still be loading while metadata changes the camera origin.
    // Preserve a valid latest command instead of replacing it with stale media time.
    const requested = state.seekRequest?.offset;
    const target = Math.max(start, Math.min(end, Number.isFinite(requested) ? requested : position));
    if (state.seekRequest?.offset !== target) {
      state = requestSeek(state, target);
    }
  }
  return state;
}

/** Request a video seek; only a subsequent video event updates the observed time. */
export function seek(offset) {
  return { type: Types.ACTION_SEEK, offset };
}

export function videoTime(fullname, offset) {
  return { type: Types.ACTION_VIDEO_TIME, fullname, offset };
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
