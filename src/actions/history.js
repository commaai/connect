import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION, ACTION_STARTUP_DATA } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

const resolveDongleId = (route, state, defaultId) => {
  const dongleId = route.dongleId ?? state.dongleId;
  if (dongleId || !state.devices.length) return dongleId;

  const findDevice = (id) => state.devices.find((d) => d.dongle_id === id);
  const rememberedId = window.localStorage.getItem('selectedDongleId');

  const device = findDevice(rememberedId) || findDevice(defaultId) || state.devices[0];
  return device.dongle_id;
};

export const syncStateFromURL = (defaultDongleId) => async (dispatch, getState) => {
  const state = getState();
  if (state.devices === null) return;

  const { pathname, search } = state.router.location;
  const route = parseURL({ pathname });
  const dongleId = resolveDongleId(route, state, defaultDongleId);

  // normalize URLs
  if (route.page === 'not-found') {
    return dispatch(replace({ pathname: dongleId ? `/${dongleId}` : '/', search }));
  }
  if (route.page === 'root' && dongleId) {
    return dispatch(replace({ pathname: `/${dongleId}`, search }));
  }
  if (route.page === 'drive' && !route.range && pathname !== `/${dongleId}/${route.logId}`) {
    return dispatch(replace({ pathname: `/${dongleId}/${route.logId}`, search }));
  }
  if (route.page === 'legacy-drive') {
    const logId = await api.routes.getRoutesSegments(dongleId, route.range.start, route.range.end)
      .then((routes) => routes?.[0]?.fullname?.split('|')[1])
      .catch((err) => console.error('Failed to resolve legacy drive URL', err));
    // ignore the result if navigation changed during the request
    const location = getState().router.location;
    if (location.pathname !== pathname) return;
    if (logId) return dispatch(replace({ pathname: `/${dongleId}/${logId}`, search: location.search }));
  }

  const deviceChanged = state.dongleId !== dongleId;
  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  // apply the destination
  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination: { dongleId, routeId: route.page === 'drive' ? route.logId : null, range: route.range },
  });

  const newState = getState();
  const playbackChanged = state.zoom !== newState.zoom || state.selectedRouteId !== newState.selectedRouteId;
  if (playbackChanged) {
    dispatch(resetPlayback());
    dispatch(selectLoop(newState.zoom?.start, newState.zoom?.end));
  }

  if (!deviceChanged) {
    if (route.page === 'drive') dispatch(checkRoutesData());
    return;
  }

  // initialize the newly selected device.
  window.localStorage.setItem('selectedDongleId', dongleId);
  if ((newState.device && !newState.device.shared) || state.profile?.superuser) {
    dispatch(primeFetchSubscription());
    dispatch(fetchDeviceOnline(dongleId));
  }
  const isOwned = state.devices?.some((device) => device.dongle_id === dongleId);
  if (!isOwned && api.auth.isAuthenticated()) {
    dispatch(fetchSharedDevice(dongleId));
  }
  dispatch(checkLastRoutesData());
};

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  if (action.type !== ACTION_STARTUP_DATA && action.type !== LOCATION_CHANGE) return next(action);

  const prevPathname = getState().router.location.pathname;
  const result = next(action);
  if (action.type === ACTION_STARTUP_DATA || prevPathname !== action.payload.location.pathname) {
    dispatch(syncStateFromURL(action.devices?.[0]?.dongle_id));
  }
  return result;
};
