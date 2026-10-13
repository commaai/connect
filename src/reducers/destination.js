import { getDefaultFilter } from '../utils/filter';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

// zooming in remembers the outer range so the back arrow can return to it
function zoomStack(current, next) {
  if (!current || !next) {
    return next;
  }
  if (sameRange(current, next)) {
    return current;
  }
  if (sameRange(current.previous, next)) {
    return current.previous;
  }
  if (next.start >= current.start && next.end <= current.end) {
    return { ...next, previous: current };
  }
  return next;
}

// The state for a destination read from the URL. Everything loaded for the
// device is kept until a different device is opened.
export default function applyDestination(state, { page, dongleId, logId, zoom }) {
  if (dongleId && dongleId !== state.dongleId) {
    state = {
      ...state,
      dongleId,
      device: state.devices?.find((device) => device.dongle_id === dongleId) || null,
      filter: getDefaultFilter(),
      subscription: null,
      subscribeInfo: null,
      files: null,
      limit: 0,
      routesMeta: { dongleId: null, start: null, end: null },
      routes: null,
      lastRoutes: null,
    };
  } else {
    state = { ...state };
  }

  state.page = ['root', 'legacy'].includes(page) ? 'dashboard' : page;
  if (page === 'drive') {
    if (logId !== state.selectedRouteId || !zoom || !state.zoom
      || zoom.start < state.zoom.start || zoom.end > state.zoom.end) {
      state.files = null;
    }
    const sameDrive = logId === state.selectedRouteId;
    state.selectedRouteId = logId;
    state.currentRoute = state.routes?.find((route) => route.log_id === logId) || null;
    state.zoom = zoomStack(sameDrive ? state.zoom : null,
      zoom || (state.currentRoute ? { start: 0, end: state.currentRoute.duration } : null));
  } else {
    state.selectedRouteId = null;
    state.currentRoute = null;
    state.zoom = null;
    state.loop = null;
  }
  return state;
}
