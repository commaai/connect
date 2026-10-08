import { LOCATION_CHANGE } from 'connected-react-router';
import { parseUrl, ROUTES } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const loc = parseUrl(action.payload.location.pathname);
    const pathDongleId = loc.dongleId;

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    if (loc.page === ROUTES.LEGACY && loc.zoom && (loc.zoom !== state.zoom)) {
      const [start, end] = [loc.zoom.start, loc.zoom.end];

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

    const pathRouteId = loc.routeId;
    // Only a drive URL carries a playback range. A legacy timestamp URL carries
    // absolute milliseconds, which are not a range and must not become one.
    const pathRouteZoom = loc.page === ROUTES.DRIVE ? loc.zoom : null;
    if (pathRouteId || state.selectedRouteId) {
      dispatch(pushTimelineRange(pathRouteId, pathRouteZoom?.start ?? null, pathRouteZoom?.end ?? null, false));
    }

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    const pathPrimeNav = loc.page === ROUTES.PRIME;
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }

    const pathStreamNav = loc.page === ROUTES.STREAM;
    if (pathStreamNav !== state.streamNav) {
      dispatch(streamNav(pathStreamNav, false));
    }
  } else {
    next(action);
  }
};
