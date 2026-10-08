import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    // The URL is parsed exactly once. Each slice of state below is synced
    // only when the route actually changed it, so moving between URLs
    // reuses everything it can — no redundant selects, fetches, or resets.
    const route = parseLocation(action.payload.location.pathname);
    if (!route) {
      return;
    }

    if (route.dongleId && route.dongleId !== state.dongleId) {
      dispatch(selectDevice(route.dongleId, false, false));
      dispatch(checkRoutesData());
    }

    if (!route.routeId && route.start != null) {
      // Device timeline range, e.g. /{dongleId}/1000/2000: resolve it to the
      // route it falls in, then select that range.
      const [start, end] = [route.start, route.end];

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

    if (route.routeId || state.selectedRouteId) {
      dispatch(pushTimelineRange(
        route.routeId || null,
        route.routeId && route.start != null ? route.start * 1000 : null,
        route.routeId && route.end != null ? route.end * 1000 : null,
        false,
      ));
    }

    if ((route.page === 'prime') !== state.primeNav) {
      dispatch(primeNav(route.page === 'prime'));
    }

    if ((route.page === 'stream') !== state.streamNav) {
      dispatch(streamNav(route.page === 'stream', false));
    }

    // 'settings' needs no state of its own: the settings modal reads the
    // route straight from the URL. From the device dashboard it opens with
    // zero state churn; from a drive it behaves like navigating to the
    // device page, which is what the URL says.
  } else {
    next(action);
  }
};
