import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, selectRoute, pushTimelineRange } from './index';
import { api } from '../api/backend';

// Makes the state match the URL. Runs for every location change: the initial
// load, links, and browser back/forward.
export function applyLocation(location) {
  return (dispatch, getState) => {
    const url = parseLocation(location);
    const state = getState();

    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(selectDevice(url.dongleId, false, false));
    }

    if (url.page === 'legacy') {
      api.routes.getRoutesSegments(url.dongleId, url.range.start, url.range.end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    } else {
      dispatch(selectRoute(url.page === 'drive' ? url.logId : null, url.range));
    }

    if (url.dongleId && url.dongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    if ((url.page === 'prime') !== getState().primeNav) {
      dispatch(primeNav(url.page === 'prime', false));
    }
    if ((url.page === 'stream') !== getState().streamNav) {
      dispatch(streamNav(url.page === 'stream', false));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action); // must be first, otherwise breaks history
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyLocation(action.payload.location));
  }
  return result;
};
