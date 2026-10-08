import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, deviceUrl } from '../url';
import { checkRoutesData, checkLastRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let revision = 0;
  return (next) => (action) => {
    if (!action) return;
    const result = next(action); // Update router before any dependent actions.
    if (action.type !== LOCATION_CHANGE) return result;

    revision += 1;
    const navigation = revision;
    const route = parseLocation(action.payload.location);
    let state = getState();
    const deviceChanged = route.dongleId && route.dongleId !== state.dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(route.dongleId, false, false));
      state = getState();
    }

    const leavingDrive = state.selectedRouteId && !route.routeId;
    const loadedRoute = state.routes?.find((r) => r.log_id === route.routeId);
    const zoom = route.zoom || (loadedRoute ? { start: 0, end: loadedRoute.duration } : null);
    if (state.selectedRouteId !== route.routeId
      || (zoom && (state.zoom?.start !== zoom.start || state.zoom?.end !== zoom.end))) {
      dispatch(pushTimelineRange(route.routeId, route.zoom?.start ?? null, route.zoom?.end ?? null, false));
    }
    if (state.primeNav !== (route.page === 'prime')) dispatch(primeNav(route.page === 'prime', false));
    if (state.streamNav !== (route.page === 'stream')) dispatch(streamNav(route.page === 'stream', false));

    if (deviceChanged && !route.routeId) dispatch(checkLastRoutesData());
    else if (route.routeId || (leavingDrive && route.page === 'dashboard')) dispatch(checkRoutesData());

    if (route.legacyRange) {
      const { start, end } = route.legacyRange;
      api.routes.getRoutesSegments(route.dongleId, start, end).then((routes) => {
        // A slow legacy lookup must never redirect a newer navigation.
        if (navigation !== revision || !routes?.length) return;
        dispatch(replace(deviceUrl(route.dongleId, 'drive', routes[0].fullname.split('|')[1])));
      }).catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    }
    return result;
  };
};
