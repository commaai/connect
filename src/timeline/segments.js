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
    console.debug('No routes data at all');
    return false;
  }
  if (!state.routes) {
    console.debug('Still loading...');
    return false;
  }
  if (state.dongleId !== state.routesMeta.dongleId) {
    console.debug('Bad dongle id');
    return false;
  }
  const fetchRange = state.filter;
  if (fetchRange.start < state.routesMeta.start) {
    console.debug('Bad start offset');
    return false;
  }
  if (fetchRange.end > state.routesMeta.end) {
    console.debug('Bad end offset');
    return false;
  }
  // a drive that isn't in the list is fetched on its own, and the list again
  // once that drive is no longer selected
  if (state.routesMeta.logId) {
    return state.routesMeta.logId === state.selectedRouteId;
  }
  if (state.selectedRouteId && !state.routes.some((route) => route.log_id === state.selectedRouteId)) {
    console.debug('Selected route not loaded');
    return false;
  }

  return true;
}