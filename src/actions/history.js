import { LOCATION_CHANGE } from 'connected-react-router';
import { getDongleID, getZoom, getPrimeNav, getClipsNav } from '../url';
import { primeNav, selectDevice, selectRange } from './index';
import { clipsExit, fetchClipsDetails, fetchClipsList } from './clips';

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
      dispatch(selectRange(pathZoom?.start, pathZoom?.end, false));
    }

    const pathPrimeNav = getPrimeNav(action.payload.location.pathname);
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }

    const pathClipsNav = getClipsNav(action.payload.location.pathname);
    if (pathClipsNav === null && state.clips) {
      dispatch(clipsExit());
    } else if (pathClipsNav !== null) {
      if (pathClipsNav.clip_id) {
        dispatch(fetchClipsDetails(pathClipsNav.clip_id));
      } else {
        dispatch(fetchClipsList(pathDongleId));
      }
    }
  } else {
    next(action);
  }
};
