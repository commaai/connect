export function hasRoutesData(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (!state.routesMeta || !state.routesMeta.dongleId || state.routesMeta.start === null || state.routesMeta.end === null) {
    return false;
  }
  if (!state.routes) {
    return false;
  }
  if (state.dongleId !== state.routesMeta.dongleId) {
    return false;
  }
  const fetchRange = state.filter;
  if (fetchRange.start < state.routesMeta.start) {
    return false;
  }
  if (fetchRange.end > state.routesMeta.end) {
    return false;
  }

  return true;
}
