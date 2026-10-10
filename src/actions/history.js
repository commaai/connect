import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../routes';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const route = parseLocation(action.payload.location);
    const dongleChanged = route.dongleId && route.dongleId !== state.dongleId;

    if (dongleChanged) {
      dispatch(selectDevice(route.dongleId, false, false));
    }

    // KNOWN BUG: reference comparison always true for objects. Preserved intentionally.
    if ((route.legacyZoom !== state.zoom) && route.legacyZoom && !route.logId) {
      const [start, end] = [route.legacyZoom.start, route.legacyZoom.end];

      api.routes.getRoutesSegments(route.dongleId, start, end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (route.logId || state.selectedRouteId) {
      dispatch(pushTimelineRange(route.logId, route.zoom?.start ?? null, route.zoom?.end ?? null, false));
    }

    if (dongleChanged) {
      dispatch(checkRoutesData());
    }

    if (route.isPrime !== state.primeNav) {
      dispatch(primeNav(route.isPrime));
    }

    if (route.isStream !== state.streamNav) {
      dispatch(streamNav(route.isStream, false));
    }
  } else {
    next(action);
  }
};
