import { LOCATION_CHANGE } from 'connected-react-router';
import { parseUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const url = parseUrl(action.payload.location.pathname);
    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(selectDevice(url.dongleId, false, false));
    }

    if (url.legacyZoom) {
      api.routes.getRoutesSegments(url.dongleId, url.legacyZoom.start, url.legacyZoom.end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1]; 
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (url.selectedRouteId || state.selectedRouteId) {
      dispatch(pushTimelineRange(url.selectedRouteId, url.zoom?.start ?? null, url.zoom?.end ?? null, false));
    }

    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    if (url.primeNav !== state.primeNav) {
      dispatch(primeNav(url.primeNav));
    }

    if (url.streamNav !== state.streamNav) {
      dispatch(streamNav(url.streamNav, false));
    }
  } else {
    next(action);
  }
};