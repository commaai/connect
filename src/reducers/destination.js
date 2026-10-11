import { getDefaultFilter } from '../utils/filter';

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
    state.selectedRouteId = logId;
    state.currentRoute = state.routes?.find((route) => route.log_id === logId) || null;
    state.zoom = zoom || (state.currentRoute ? { start: 0, end: state.currentRoute.duration } : null);
  } else {
    state.selectedRouteId = null;
    state.currentRoute = null;
    state.zoom = null;
    state.loop = null;
  }
  return state;
}
