import { LOCATION_CHANGE } from 'connected-react-router';

import { parseLocation } from '../url';
import { getDefaultFilter } from '../utils/filter';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

// Everything loaded for one device is dropped when switching to another.
function deviceState(state, dongleId) {
  return {
    dongleId,
    device: state.devices?.find((d) => d.dongle_id === dongleId) || null,
    filter: getDefaultFilter(),
    limit: 0,
    routes: null,
    lastRoutes: null,
    routesMeta: { dongleId: null, start: null, end: null },
    subscription: null,
    subscribeInfo: null,
    files: null,
  };
}

// A drive without a range in its URL shows all of it, which needs the route's duration. Each
// zoom remembers the one it was zoomed in from, so the back button can step out one level,
// and the whole drive is the outermost.
function driveState(state, logId, zoom) {
  const route = logId ? state.routes?.find((r) => r.log_id === logId) || null : null;
  const whole = route && { start: 0, end: route.duration };
  const target = zoom || whole;
  if (logId === state.selectedRouteId && sameRange(target, state.zoom)) return null;

  const current = logId === state.selectedRouteId ? state.zoom : null;
  const next = target && (sameRange(target, current?.previous)
    ? current.previous
    : { ...target, previous: target === whole || sameRange(current, whole) ? null : current });

  const zoomedIn = current && next && next.start >= current.start && next.end <= current.end;
  return {
    selectedRouteId: logId,
    currentRoute: route,
    zoom: next,
    files: zoomedIn ? state.files : null,
    // a new selection restarts playback over it
    loop: next && { startTime: next.start, duration: next.end - next.start },
    desiredPlaySpeed: logId ? 1 : 0,
    isBufferingVideo: true,
    offset: 0,
    startTime: Date.now(),
  };
}

// The URL is the source of truth for what's on screen, and this is the only place it becomes
// state. Anything the new URL doesn't change is left as is, so it isn't re-rendered or refetched.
export default function locationReducer(state, action) {
  if (action.type !== LOCATION_CHANGE) return state;

  // a URL without a device, like /referrals, keeps the current one
  const { page, modal, dongleId = state.dongleId, logId = null, zoom = null } = parseLocation(action.payload.location);
  const next = { ...state, page, modal };
  if (dongleId !== state.dongleId) Object.assign(next, deviceState(state, dongleId));
  return Object.assign(next, driveState(next, logId, zoom));
}
