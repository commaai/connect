import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { buildUrl, isPublic, parseUrl } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, fetchDeviceOnline, loadDevice } from './index';

// old links name a drive by its time range, look the drive up and swap in its real url
function resolveLegacyUrl({ dongleId, start, end }) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routes?.length > 0 && getState().page === 'legacy') {
        const logId = routes[0].fullname.split('|')[1];
        dispatch(replace(buildUrl({ page: 'drive', dongleId, logId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// every url change passes through here, whatever caused it: a click, back/forward, a redirect or
// the first load. the reducer applies the url (applyUrl), then this loads what the page needs
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }
  if (action.type !== LOCATION_CHANGE) {
    return next(action);
  }

  const previous = getState();
  const result = next(action); // must be first, otherwise breaks history
  const state = getState();

  if (state.dongleId !== previous.dongleId) {
    window.localStorage.setItem('selectedDongleId', state.dongleId);
    webrtcConnectionManager.disconnect();
    if (state.profile) {
      dispatch(loadDevice(state.dongleId));
    }
    if (state.device) {
      dispatch(fetchDeviceOnline(state.dongleId));
    }
  }

  if (state.zoom !== previous.zoom) {
    dispatch(resetPlayback());
    dispatch(selectLoop(state.zoom?.start, state.zoom?.end));
  }

  // signed out, everything except a shared drive is the sign in page, which loads nothing
  const destination = parseUrl(action.payload.location);
  if (api.auth.isAuthenticated() || isPublic(destination)) {
    if (destination.page === 'legacy') {
      dispatch(resolveLegacyUrl(destination));
    }
    dispatch(checkRoutesData());
  }

  return result;
};
