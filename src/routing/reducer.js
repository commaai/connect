import { findRoute } from './selectors';
import { ROUTE_CHANGED } from './actions';

// Selection changes do not invalidate loaded data or reset an unchanged drive.
export default function routeReducer(state, action) {
  if (action.type !== ROUTE_CHANGED) return state;
  const route = action.route;
  const sameDrive = state.selectedRouteId === route.routeId;
  const currentRoute = route.routeId ? findRoute(state, route.routeId) || (sameDrive ? state.currentRoute : null) : null;
  const requested = route.range || (currentRoute ? { start: 0, end: currentRoute.duration } : null);
  const sameRange = state.zoom?.start === requested?.start && state.zoom?.end === requested?.end;
  return {
    ...state, route,
    primeNav: route.page === 'prime', streamNav: route.page === 'stream',
    selectedRouteId: route.routeId, currentRoute,
    zoom: sameDrive && sameRange ? state.zoom : requested ? { ...requested, previous: sameDrive ? state.zoom : null } : null,
    loop: sameDrive && sameRange ? state.loop : requested ? { startTime: requested.start, duration: requested.end - requested.start } : null,
    offset: sameDrive && sameRange ? state.offset : requested?.start ?? 0,
    startTime: sameDrive && sameRange ? state.startTime : Date.now(),
  };
}
