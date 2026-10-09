import { LOCATION_CHANGE } from 'connected-react-router';
import { parsePath } from '../url';
import { checkRoutesData, primeNav, streamNav, settingsNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const parsed = parsePath(action.payload.location.pathname, action.payload.location.search);
    const pathDongleId = parsed.dongleId;
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    const pathZoom = parsed.legacyZoom;
    const pathRouteId = parsed.routeId;
    const pathRouteZoom = parsed.zoom;

    if ((pathZoom !== state.zoom) && pathZoom && !pathRouteId) {
      const [start, end] = [pathZoom.start, pathZoom.end];

      api.routes.getRoutesSegments(pathDongleId, start, end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1]; 
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (pathRouteId || state.selectedRouteId) {
      dispatch(pushTimelineRange(pathRouteId, pathRouteZoom?.start ?? null, pathRouteZoom?.end ?? null, false));
    }

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    if (parsed.primeNav !== state.primeNav) {
      dispatch(primeNav(parsed.primeNav, false));
    }

    if (parsed.streamNav !== state.streamNav) {
      dispatch(streamNav(parsed.streamNav, false));
    }

    if (parsed.settingsNav !== state.settingsNav) {
      dispatch(settingsNav(parsed.settingsNav, false));
    }
  } else {
    next(action);
  }
};
