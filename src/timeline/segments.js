// Selected drives and dashboard coverage are independent cache questions.
export function hasRoutesData(state) {
  if (!state) return false;
  if (state.selectedRouteId) {
    return state.missingRouteId === state.selectedRouteId
      || Boolean(state.routes?.some((route) => route.log_id === state.selectedRouteId));
  }
  if (state.devices?.length === 0 && !state.dongleId) return true;
  const meta = state.routesMeta;
  return Boolean(meta && meta.dongleId === state.dongleId && meta.start != null && meta.end != null
    && state.filter.start >= meta.start && state.filter.end <= meta.end);
}

// Only list requests establish which cached drives belong on the dashboard.
export function dashboardRoutes(state) {
  const ids = state.routesMeta.routeIds;
  return ids ? state.routes?.filter((route) => ids.includes(route.log_id)) ?? [] : null;
}
