import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation, devicePage } from '../url';
import { checkRoutesData, showPage, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const { page, dongleId, routeId, zoom, range } = parseLocation(action.payload.location.pathname);

    if (dongleId && dongleId !== state.dongleId) {
      dispatch(selectDevice(dongleId, false, false));
    }

    if (range) {
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
      dispatch(pushTimelineRange(routeId, zoom?.start ?? null, zoom?.end ?? null, false));
    }

    if (dongleId && dongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    const statePage = devicePage(page);
    if (statePage !== getState().page) {
      dispatch(showPage(statePage, false));
    }
  } else {
    next(action);
  }
};
