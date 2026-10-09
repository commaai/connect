import { LOCATION_CHANGE, push } from 'connected-react-router';
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

    const destination = destinationFromUrl(action.payload.location);
    const pathDongleId = destination.dongleId;
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    const pathZoom = destination.page === 'legacy' ? destination.range : null;
    const pathRouteId = destination.logId;
    const pathRouteZoom = destination.page === 'drive' ? destination.range : null;

    if (pathZoom) {
      const [start, end] = [pathZoom.start, pathZoom.end];

      api.routes.getRoutesSegments(pathDongleId, start, end).then((routesData) => {
        if (getState().dongleId !== pathDongleId) return;
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;
          dispatch(pushTimelineRange(log_id, 0, duration, false));
          dispatch(push(urlForDestination({ page: 'drive', dongleId: pathDongleId, logId: log_id })));
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

    const pathPrimeNav = destination.page === 'prime';
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }

    const pathStreamNav = destination.page === 'stream';
    if (pathStreamNav !== state.streamNav) {
      dispatch(streamNav(pathStreamNav, false));
    }
  } else {
    next(action);
  }
};
