import { LOCATION_CHANGE } from 'connected-react-router';
import { getDongleID, getZoom, getPrimeNav } from '../url';
import { primeNav, selectDevice, pushTimelineRange } from './index';

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
    if (pathZoom !== state.zoom) {
      dispatch(pushTimelineRange(pathZoom?.start, pathZoom?.end, false));
    }

    const pathPrimeNav = getPrimeNav(action.payload.location.pathname);
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }
  } else {
    next(action);
  }
};
