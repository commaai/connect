import { LOCATION_CHANGE } from 'connected-react-router';
import { replace } from 'connected-react-router';
import { parseLocation, pathForNavigation } from '../url';
import { checkRoutesData, selectDevice, pushTimelineRange } from './index';
import { ACTION_NAVIGATION } from './types';
import { api } from '../api/backend';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let navigationVersion = 0;
  return (next) => (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);

    const previousState = getState();
    const previous = previousState.navigation || parseLocation(previousState.router?.location);
    const location = action.payload.location;
    const navigation = parseLocation(location);
    navigationVersion += 1;
    const version = navigationVersion;
    const result = next(action); // The router must receive the location first.

    const deviceChanged = navigation.dongleId && navigation.dongleId !== previousState.dongleId;
    if (deviceChanged) dispatch(selectDevice(navigation.dongleId, false, false));
    dispatch({ type: ACTION_NAVIGATION, navigation });

    const state = getState();
    const selectionChanged = deviceChanged || previous.routeId !== navigation.routeId
      || !sameRange(previous.zoom, navigation.zoom);
    if (navigation.routeId && (selectionChanged || state.selectedRouteId !== navigation.routeId)) {
      dispatch(pushTimelineRange(navigation.routeId, navigation.zoom?.start ?? null,
        navigation.zoom?.end ?? null, false));
    } else if (!navigation.routeId && !navigation.legacyZoom && state.selectedRouteId) {
      dispatch(pushTimelineRange(null, null, null, false));
    }

    if (navigation.legacyZoom) {
      const { start, end } = navigation.legacyZoom;
      api.routes.getRoutesSegments(navigation.dongleId, start, end).then((routesData) => {
        if (version !== navigationVersion || !routesData?.length) return;
        const route = routesData[0];
        const routeId = route.fullname?.split('|')[1];
        const duration = route.end_time_utc_millis - route.start_time_utc_millis;
        const pathname = pathForNavigation({ ...navigation, routeId, zoom: null });
        if (!routeId || !Number.isFinite(duration) || duration <= 0 || !parseLocation(pathname).routeId) return;
        // Replace the legacy entry; Back should return to the previous page.
        dispatch(replace(`${pathname}${location.search || ''}${location.hash || ''}`));
      }).catch((err) => {
        if (version === navigationVersion) console.error('Error fetching routes data for log ID conversion', err);
      });
    } else if (deviceChanged || selectionChanged) {
      dispatch(checkRoutesData());
    }
    return result;
  };
};
