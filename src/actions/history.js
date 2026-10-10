import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { destinationFromUrl, urlForDestination } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const { pathname } = action.payload.location;
    const dest = destinationFromUrl(pathname);
    const deviceChanged = dest.dongleId && dest.dongleId !== state.dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(dest.dongleId, false, false));
    }

    if (dest.legacyRange && dest.legacyRange !== state.zoom) {
      const { start, end } = dest.legacyRange;

      api.routes.getRoutesSegments(dest.dongleId, start, end).then((routesData) => {
        // the user may have navigated elsewhere while the lookup was running
        const currentPath = getState().router?.location?.pathname ?? pathname;
        if (routesData && routesData.length > 0 && currentPath === pathname) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(replace(urlForDestination({ dongleId: dest.dongleId, routeId: log_id })));
          dispatch(pushTimelineRange(log_id, 0, duration, false));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (dest.routeId || state.selectedRouteId) {
      dispatch(pushTimelineRange(dest.routeId, dest.range?.start ?? null, dest.range?.end ?? null, false));
    }

    if (deviceChanged) {
      dispatch(checkRoutesData());
    }

    if (dest.prime !== state.primeNav) {
      dispatch(primeNav(dest.prime, false));
    }

    if (dest.stream !== state.streamNav) {
      dispatch(streamNav(dest.stream, false));
    }
  } else {
    next(action);
  }
};
