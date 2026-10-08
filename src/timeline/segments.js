export function hasRoutesData(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (state.selectedRouteId) {
    return Boolean(state.routes?.some((r) => r.log_id === state.selectedRouteId)
      || state.missingRoutes?.includes(state.selectedRouteId));
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