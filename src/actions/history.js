import { LOCATION_CHANGE } from 'connected-react-router';
import { getDongleID, getZoom, getSegmentRange, getPrimeNav } from '../url';
import { primeNav, selectDevice, pushTimelineRange, checkRoutesData } from './index';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const pathDongleId = getDongleID(action.payload.location.pathname);
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false));
    }

    const pathZoom = getZoom(action.payload.location.pathname);
    const pathSegmentRange = getSegmentRange(action.payload.location.pathname);

    if (pathSegmentRange && pathSegmentRange.log_id) {
      // Fetch metadata for the log ID if not already present
      if (!state.routesMeta || state.routesMeta.log_id !== pathSegmentRange.log_id) {
        dispatch(checkRoutesData());
      }

      // Push timeline range with the log ID and the associated start and end times
      dispatch(pushTimelineRange(pathSegmentRange.log_id, pathSegmentRange.start, pathSegmentRange.end, false));
    } else if (pathZoom) {
      // Handle only zoom changes when no segment range is present
      dispatch(pushTimelineRange(null, pathZoom.start, pathZoom.end, false));
    }

    const pathPrimeNav = getPrimeNav(action.payload.location.pathname);
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }
  } else {
    next(action);
  }
};