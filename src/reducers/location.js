import { getDefaultFilter } from '../utils/filter';

// Puts a location parsed from the URL (see url.js) into the state. Whatever
// the URL doesn't describe carries over, so moving between the pages and
// drives of a device keeps its drive list, filter and subscription.
export function applyLocation(state, { dongleId, logId = null, zoom = null, page = null }) {
  const next = dongleId && dongleId !== state.dongleId ? switchDevice(state, dongleId) : { ...state };
  next.page = page;

  if (logId !== next.selectedRouteId) {
    next.selectedRouteId = logId;
    next.currentRoute = next.routes?.find((route) => route.log_id === logId) || null;
    next.files = null;
  }
  // without a zoom in the URL the whole drive is shown, once it has loaded
  next.zoom = logId ? (zoom || wholeDrive(next.currentRoute)) : null;

  return next;
}

function switchDevice(state, dongleId) {
  return {
    ...state,
    dongleId,
    device: state.devices?.find((device) => device.dongle_id === dongleId) || null,
    filter: getDefaultFilter(),
    limit: 0,
    routes: null,
    routesMeta: { dongleId: null, start: null, end: null },
    lastRoutes: null,
    currentRoute: null,
    files: null,
    subscription: null,
    subscribeInfo: null,
  };
}

function wholeDrive(route) {
  return route ? { start: 0, end: route.duration } : null;
}
