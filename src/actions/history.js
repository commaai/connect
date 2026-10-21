import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = () => async (dispatch, getState) => {
  let state = getState();
  if (state.devices === null) return;

  const currentPath = state.router.location.pathname;
  let route = parseURL(state.router.location);

  if (route.page === 'legacy-drive') {
    const logId = await api.routes.getRoutesSegments(route.dongleId, route.range.start, route.range.end)
      .then((routes) => routes?.[0]?.fullname?.split('|')[1])
      .catch((err) => console.error('Failed to resolve legacy drive URL', err));

    if (logId) route = { ...route, page: 'drive', logId, range: null };
  }

  state = getState();
  const { pathname, search } = state.router.location;
  if (pathname !== currentPath) return;

  const dongleId = route.dongleId ?? state.dongleId ?? state.devices[0]?.dongle_id ?? null;
  const resolvedPath = buildURL({ ...route, dongleId }) ?? pathname;
  if (pathname !== resolvedPath) return dispatch(replace({ pathname: resolvedPath, search }));

  if (state.dongleId && state.dongleId !== dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination: { dongleId, routeId: route.logId ?? null, range: route.range },
  });

  const newState = getState();
  const playbackChanged = state.zoom !== newState.zoom || state.selectedRouteId !== newState.selectedRouteId;
  if (playbackChanged) {
    dispatch(resetPlayback());
    dispatch(selectLoop(newState.zoom?.start, newState.zoom?.end));
  }

  if (state.dongleId === dongleId) {
    if (route.logId) dispatch(checkRoutesData());
    return;
  }

  // initialize the newly selected device.
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
  if (action.type !== LOCATION_CHANGE) return next(action);

  const prevPathname = getState().router.location.pathname;
  const result = next(action);
  if (prevPathname !== action.payload.location.pathname) {
    dispatch(syncStateFromURL());
  }
  return result;
};
