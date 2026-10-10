// Domain lookup is keyed by device + drive, independent of the dashboard filter.
export function findRoute(state, routeId) {
  return (state.currentRoute?.log_id === routeId ? state.currentRoute : null)
    || state.routeEntities?.[`${state.dongleId}|${routeId}`]
    || state.routes?.find((route) => route.log_id === routeId)
    || null;
}
