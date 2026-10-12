import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = (pathname, defaultDongleId) => async (dispatch, getState) => {
  const state = getState();
  if (state.devices === null) return;

  const { page, dongleId: urlDongleId, logId, range } = parseURL({ pathname });
  const { search } = state.router.location;

  let dongleId = urlDongleId ?? state.dongleId;
  if (!dongleId && state.devices.length) {
    const rememberedDongleId = window.localStorage.getItem('selectedDongleId');
    const selectedDevice = state.devices.find((device) => device.dongle_id === rememberedDongleId)
      || state.devices.find((device) => device.dongle_id === defaultDongleId)
      || state.devices[0];
    dongleId = selectedDevice.dongle_id;
  }

  if (page === 'not-found') {
    return dispatch(replace({ pathname: dongleId ? `/${dongleId}` : '/', search }));
  }
  if (page === 'root' && dongleId) {
    return dispatch(replace({ pathname: `/${dongleId}`, search }));
  }
  if (page === 'drive' && !range && pathname !== `/${dongleId}/${logId}`) {
    return dispatch(replace({ pathname: `/${dongleId}/${logId}`, search }));
  }
  if (page === 'legacy-drive') {
    let resolvedLogId;
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      resolvedLogId = routes?.[0]?.fullname?.split('|')[1];
    } catch (err) {
      console.error('Failed to resolve legacy drive URL', err);
    }
    const location = getState().router.location;
    if (location.pathname !== pathname) return;
    if (resolvedLogId) return dispatch(replace({ pathname: `/${dongleId}/${resolvedLogId}`, search: location.search }));
  }

  const deviceChanged = state.dongleId !== dongleId;
  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination: { dongleId, routeId: page === 'drive' ? logId : null, range },
  });

  const { zoom, selectedRouteId, device } = getState();
  if (state.zoom !== zoom || state.selectedRouteId !== selectedRouteId) {
    dispatch(resetPlayback());
    dispatch(selectLoop(zoom?.start, zoom?.end));
  }

  if (deviceChanged) {
    window.localStorage.setItem('selectedDongleId', dongleId);
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription());
      dispatch(fetchDeviceOnline(dongleId));
    }
    if (!device && api.auth.isAuthenticated()) {
      dispatch(fetchSharedDevice(dongleId));
    }
    dispatch(checkLastRoutesData());
  } else if (page === 'drive') {
    dispatch(checkRoutesData());
  }
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  const previousPathname = getState().router.location.pathname;

  next(action); // must be first, otherwise breaks history

  if (action.type === LOCATION_CHANGE && previousPathname !== action.payload.location.pathname) {
    dispatch(syncStateFromURL(action.payload.location.pathname));
  }
};
