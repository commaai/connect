import * as Types from '../actions/types';

export const SEGMENT_LENGTH = 1000 * 60;

// duplicate from `timeline/playback.js` because of circular import
function currentOffset(state) {
  let offset = null;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime - state.filter.start;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime - state.filter.start;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
}

export function getCurrentRoute(state, o) {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.routes || !offset) {
    return null;
  }

  return state.routes.find((r) => offset >= r.offset && offset <= r.offset + r.duration);
}

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_UPDATE_SEGMENTS:
      state = {
        ...state,
      };
      break;
    default:
      break;
  }

  const currentRoute = getCurrentRoute(state);
  state.currentRoute = currentRoute ? { ...currentRoute } : null;

  return state;
}

export function updateSegments() {
  return {
    type: Types.ACTION_UPDATE_SEGMENTS,
  };
}

export function getSegmentFetchRange(state) {
  if (!state.zoom && !(state.clips && state.clips.state === 'upload')) {
    return state.filter;
  }
  if (state.clips && state.clips.end_time < state.filter.start) {
    return {
      start: state.clips.start_time,
      end: state.clips.end_time,
    };
  }
  if (state.zoom && state.zoom.end < state.filter.start) {
    return {
      start: state.zoom.start,
      end: state.zoom.end,
    };
  }
  const mins = [state.filter.start];
  const maxs = [state.filter.end];
  if (state.clips && state.clips.state === 'upload') {
    mins.push(state.clips.start_time);
    maxs.push(state.clips.end_time);
  }
  if (state.zoom) {
    mins.push(state.zoom.start);
    maxs.push(state.zoom.end);
  }
  return {
    start: Math.min(...mins),
    end: Math.max(...maxs),
  };
}

export function hasRoutesData(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (!state.routesMeta || !state.routesMeta.dongleId || state.routesMeta.start === null
    || state.routesMeta.end === null) {
    console.log('No routes data at all');
    return false;
  }
  if (!state.routes) {
    console.log('Still loading...');
    return false;
  }
  if (state.dongleId !== state.routesMeta.dongleId) {
    console.log('Bad dongle id');
    return false;
  }
  const fetchRange = getSegmentFetchRange(state);
  if (fetchRange.start < state.routesMeta.start) {
    console.log('Bad start offset');
    return false;
  }
  if (fetchRange.end > state.routesMeta.end) {
    console.log('Bad end offset');
    return false;
  }

  return true;
}
