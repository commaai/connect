export function hasRoutesData(state) {
  if (!state) return false;
  if (state.selectedRouteId) {
    return state.missingRouteId === state.selectedRouteId
      || Boolean(state.routes?.some((route) => route.log_id === state.selectedRouteId));
  }
  if (state.devices?.length === 0 && !state.dongleId) return true;
  const { routesMeta, filter, dongleId } = state;
  if (!routesMeta || routesMeta.dongleId !== dongleId) return false;
  if (routesMeta.start == null || routesMeta.end == null) return false;
  return filter.start >= routesMeta.start && filter.end <= routesMeta.end;
}

export function dashboardRoutes(state) {
  const { routeIds } = state.routesMeta;
  if (!routeIds) return null;
  return state.routes?.filter((route) => routeIds.includes(route.log_id)) ?? [];
}
