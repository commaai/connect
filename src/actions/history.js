import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, routePath } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let navigation = 0;
  return (next) => (action) => {
    if (!action) return;
    const result = next(action); // The router must see the location before reconciliation.
    if (action.type !== LOCATION_CHANGE) return result;
    navigation += 1;
    const currentNavigation = navigation;
    const location = action.payload.location;
    const target = parseLocation(location);
    if (target.page === 'auth' || target.page === 'unknown') return result;

    let state = getState();
    const changedDevice = target.dongleId && target.dongleId !== state.dongleId;
    if (changedDevice) {
      dispatch(selectDevice(target.dongleId, false, false));
      state = getState();
    }

    if (target.legacyRange) {
      if (state.selectedRouteId) dispatch(pushTimelineRange(null, null, null, false));
      const { start, end } = target.legacyRange;
      api.routes.getRoutesSegments(target.dongleId, start, end).then((routes) => {
        // A response from an old URL must never redirect a newer navigation.
        if (currentNavigation !== navigation || !routes?.length) return;
        const routeId = routes[0].fullname.split('|')[1];
        dispatch(replace({ ...location, pathname: routePath(target.dongleId, routeId) }));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    } else {
      const sameRoute = target.routeId === state.selectedRouteId;
      const sameRange = target.range
        ? target.range.start === state.zoom?.start && target.range.end === state.zoom?.end
        : !state.zoom || (state.zoom.start === 0 && state.zoom.end === state.currentRoute?.duration);
      if (!sameRoute || !sameRange) {
        dispatch(pushTimelineRange(target.routeId, target.range?.start ?? null, target.range?.end ?? null, false));
      }
      if (changedDevice || !sameRoute && target.routeId) dispatch(checkRoutesData());
    }
    if ((target.page === 'prime') !== state.primeNav) dispatch(primeNav(target.page === 'prime', false));
    if ((target.page === 'stream') !== state.streamNav) dispatch(streamNav(target.page === 'stream', false));
    return result;
  };
};
