import { LOCATION_CHANGE } from 'connected-react-router';
import { parsePath, secToMs } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    // Single canonical interpretation of the new pathname. Thunks below
    // keep their existing side effects; only the parsing is consolidated.
    const parsed = parsePath(action.payload.location.pathname);

    const pathDongleId = parsed.dongleId;
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    if (parsed.kind === 'legacyRange') {
      // Legacy timestamps resolve asynchronously exactly as before.
      // parsePath only identifies the shape; it never fetches.
      api.routes.getRoutesSegments(pathDongleId, parsed.startSec, parsed.endSec).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    let pathRouteId = null;
    let rangeStart = null;
    let rangeEnd = null;
    if (parsed.kind === 'drive') {
      pathRouteId = parsed.logId;
    } else if (parsed.kind === 'driveRange') {
      pathRouteId = parsed.logId;
      rangeStart = secToMs(parsed.startSec);
      rangeEnd = secToMs(parsed.endSec);
    }

    if (pathRouteId || state.selectedRouteId) {
      dispatch(pushTimelineRange(pathRouteId, rangeStart, rangeEnd, false));
    }

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    const pathPrimeNav = parsed.kind === 'prime';
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }

    const pathStreamNav = parsed.kind === 'stream';
    if (pathStreamNav !== state.streamNav) {
      dispatch(streamNav(pathStreamNav, false));
    }
  } else {
    next(action);
  }
};
