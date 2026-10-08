import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { isPublic, parseLocation, urlFor } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkLastRoutesData, checkRoutesData, loadDevice, openDefaultDevice } from './index';

// Old links name a drive by its start and end time; swap in the drive's own URL.
function resolveLegacyUrl(pathname, { dongleId, start, end }) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      const logId = routes?.[0]?.fullname.split('|')[1];
      if (logId && getState().router.location.pathname === pathname) {
        dispatch(replace(urlFor({ dongleId, logId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// By the time this runs the reducer has applied the new URL; this fetches whatever the new
// view needs that isn't loaded yet.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }
  if (action.type !== LOCATION_CHANGE) {
    return next(action);
  }

  const previousDongleId = getState().dongleId;
  const result = next(action);
  const state = getState();
  if (!state.dongleId) {
    dispatch(openDefaultDevice());
    return result;
  }
  if (!api.auth.isAuthenticated() && !isPublic(state.page)) {
    return result;
  }

  if (state.dongleId !== previousDongleId) {
    window.localStorage.setItem('selectedDongleId', state.dongleId);
    if (previousDongleId) webrtcConnectionManager.disconnect();
    dispatch(loadDevice(state.dongleId));
    dispatch(checkLastRoutesData());
  } else if (!state.currentRoute) {
    dispatch(checkRoutesData());
  }

  if (state.page === 'legacy') {
    const { location } = action.payload;
    dispatch(resolveLegacyUrl(location.pathname, parseLocation(location)));
  }
  return result;
};
