import { LOCATION_CHANGE, push } from 'connected-react-router';
import { Pages, parseUrl, formatUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

// URL -> state for back/forward navigation. Pushes and replaces are made by
// the navigation actions themselves, which build their URL with formatUrl.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const url = parseUrl(action.payload.location.pathname, action.payload.location.search);

    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(selectDevice(url.dongleId, false, false));
    }

    // drives used to be addressed by unix timestamps; look up the route that
    // covers the range and open it like a modern whole-route URL
    if (url.timeRange) {
      api.routes.getRoutesSegments(url.dongleId, url.timeRange.start, url.timeRange.end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, false));
          dispatch(push(formatUrl({
            dongleId: url.dongleId,
            page: Pages.DRIVE,
            routeId: log_id,
          })));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    if (url.routeId || state.selectedRouteId) {
      dispatch(pushTimelineRange(url.routeId, url.zoom?.start ?? null, url.zoom?.end ?? null, false));
    }

    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    const primeNavActive = url.page === Pages.PRIME;
    if (primeNavActive !== state.primeNav) {
      dispatch(primeNav(primeNavActive, false));
    }

    const streamNavActive = url.page === Pages.STREAM;
    if (streamNavActive !== state.streamNav) {
      dispatch(streamNav(streamNavActive, false));
    }
  } else {
    next(action);
  }
};
