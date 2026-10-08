export function hasRoutesData(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (state.selectedRouteId) {
    return Boolean(state.routes?.some((route) => route.log_id === state.selectedRouteId))
      || Object.hasOwn(state.driveRoutes || {}, state.selectedRouteId);
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

  return true;
}

export function rangeForRoute(range, route) {
  if (!route) return range;
  if (!Number.isFinite(route.duration) || route.duration <= 0) return { start: 0, end: 0 };
  if (!range || range.start >= route.duration) return { start: 0, end: route.duration };
  return { start: range.start, end: Math.min(range.end, route.duration) };
}
