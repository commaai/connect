import { LOCATION_CHANGE } from 'connected-react-router';
import { parseUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

// Back, forward and replace put the URL ahead of the state, so bring the state up to the URL.
// Our own navigation (push) updates the state first and needs nothing from here.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const { page, dongleId, routeId, range } = parseUrl(action.payload.location.pathname);

    const deviceChanged = dongleId && dongleId !== state.dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(dongleId, false, false));
    }

    if (page === 'legacyRange') {
      api.routes.getRoutesSegments(dongleId, range.start, range.end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (routeId || state.selectedRouteId) {
      dispatch(pushTimelineRange(routeId ?? null, range?.start ?? null, range?.end ?? null, false));
    }

    if (deviceChanged) {
      dispatch(checkRoutesData());
    }

    if ((page === 'prime') !== state.primeNav) {
      dispatch(primeNav(page === 'prime'));
    }

    if ((page === 'stream') !== state.streamNav) {
      dispatch(streamNav(page === 'stream', false));
    }
  } else {
    next(action);
  }
};
