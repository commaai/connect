import * as Types from '../actions/types';

export function reducer(_state, action) {
  let state = { ..._state };
  let clamp = false;
  switch (action.type) {
    case Types.ACTION_VIDEO_PROGRESS:
      if (state.currentRoute && state.currentRoute.fullname === action.fullname && Number.isFinite(action.offset)) {
        state.offset = action.offset;
      }
      return state;
    case Types.ACTION_SEEK:
      if (!Number.isFinite(action.offset)) return state;
      state.offset = action.offset;
      state.seekId = (state.seekId || 0) + 1;
      clamp = true;
      break;
    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;
    case Types.ACTION_PLAY:
      state.desiredPlaySpeed = action.speed;
      break;
    case Types.ACTION_LOOP:
      state.loop = Number.isFinite(action.start) && Number.isFinite(action.end)
        ? { startTime: action.start, duration: Math.max(0, action.end - action.start) }
        : null;
      clamp = true;
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        offset: 0,
        seekId: (state.seekId || 0) + 1,
      };
      clamp = true;
      break;
    case Types.ACTION_UPDATE_ROUTE_EVENTS:
    case Types.ACTION_ROUTES_METADATA:
      clamp = Boolean(state.currentRoute) && (action.type === Types.ACTION_ROUTES_METADATA || action.fullname === state.currentRoute.fullname);
      break;
    default:
      break;
  }

  if (clamp) {
    const end = state.loop ? state.loop.startTime + state.loop.duration : (state.currentRoute?.duration ?? Infinity);
    const start = Math.min(end, Math.max(0, state.loop?.startTime ?? 0, state.currentRoute?.videoStartOffset ?? 0));
    if (state.loop && state.loop.startTime < start) {
      state.loop = { startTime: start, duration: end - start };
    }
    // Metadata can reveal a later video start; the player owns the loop end.
    if ((action.type === Types.ACTION_UPDATE_ROUTE_EVENTS || action.type === Types.ACTION_ROUTES_METADATA)
      && state.offset != null && state.offset >= start) return state;
    // Explicit seeks stop at the nearest edge; any other position outside the range restarts it.
    let offset = state.offset != null && state.offset >= start && state.offset <= end ? state.offset : start;
    if (action.type === Types.ACTION_SEEK) offset = Math.max(start, Math.min(end, state.offset));
    if (offset !== state.offset) {
      state.offset = offset;
      if (action.type === Types.ACTION_LOOP || action.type === Types.ACTION_ROUTES_METADATA) {
        state.seekId = (state.seekId || 0) + 1;
      }
    }
  }

  return state;
}

export function videoProgress(offset, fullname) {
  return { type: Types.ACTION_VIDEO_PROGRESS, offset, fullname };
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume / change play speed
export function play(speed = 1) {
  return {
    type: Types.ACTION_PLAY,
    speed,
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
