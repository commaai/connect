import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parsePath, pathForRoute } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

const locationKey = (location) => `${location.pathname}${location.search || ''}${location.hash || ''}`;
const sameZoom = (first, second) => (first?.start ?? null) === (second?.start ?? null)
  && (first?.end ?? null) === (second?.end ?? null);

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => {
  let navigation = 0;
  return (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);
    // The router must see the location before derived state is applied.
    const result = next(action);
    navigation += 1;
    const token = navigation;
    const location = action.payload.location;
    const parsed = parsePath(location.pathname);
    const destination = parsed.kind === 'home'
      ? { ...parsed, dongleId: getState().dongleId } : parsed;
    if (!destination.dongleId) {
      if (destination.kind === 'referrals') {
        const current = getState();
        if (current.primeNav) dispatch(primeNav(false, false));
        if (current.streamNav) dispatch(streamNav(false, false));
      }
      return result;
    }

    let state = getState();
    const changedDevice = destination.dongleId !== state.dongleId;
    if (changedDevice) {
      dispatch(selectDevice(destination.dongleId, false, false));
      state = getState();
    }

    if (destination.kind === 'legacy') {
      const { start, end } = destination.legacyZoom;
      api.routes.getRoutesSegments(destination.dongleId, start, end).then((routes) => {
        const route = routes?.[0];
        const currentLocation = getState().router?.location;
        if (!route || token !== navigation
          || (currentLocation && locationKey(currentLocation) !== locationKey(location))) return;
        const routeId = route.fullname?.split('|')[1];
        const duration = route.end_time_utc_millis - route.start_time_utc_millis;
        if (!routeId || !Number.isFinite(duration) || duration <= 0) return;
        // Replace avoids a back-button loop through the legacy URL.
        dispatch(replace({ ...location, pathname: pathForRoute({ dongleId: destination.dongleId, routeId }) }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    } else if (state.selectedRouteId !== destination.routeId
      || !(sameZoom(state.zoom, destination.zoom)
        || (destination.routeId && !destination.zoom && state.zoom?.start === 0
          && state.zoom?.end === state.currentRoute?.duration))) {
      dispatch(pushTimelineRange(destination.routeId, destination.zoom?.start ?? null,
        destination.zoom?.end ?? null, false));
    }

    const prime = destination.kind === 'prime';
    const stream = destination.kind === 'stream';
    if (state.primeNav !== prime) dispatch(primeNav(prime, false));
    if (state.streamNav !== stream) dispatch(streamNav(stream, false));
    if (changedDevice || (destination.routeId && state.selectedRouteId !== destination.routeId)) {
      dispatch(checkRoutesData());
    }
    return result;
  };
};
