import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { resolveURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = () => async (dispatch, getState) => {
  let state = getState();
  if (state.devices === null) return;

  const currentPath = state.router.location.pathname;
  const { dongleId, logId, range, pathname: resolvedPath } = await resolveURL(state);

  state = getState();
  const { pathname, search } = state.router.location;

  if (pathname !== currentPath) return;
  if (pathname !== resolvedPath) return dispatch(replace({ pathname: resolvedPath, search }));
  if (state.dongleId && state.dongleId !== dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination: { dongleId, routeId: logId ?? null, range },
  });

  const newState = getState();
  const playbackChanged = state.zoom !== newState.zoom || state.selectedRouteId !== newState.selectedRouteId;
  if (playbackChanged) {
    dispatch(resetPlayback());
    dispatch(selectLoop(newState.zoom?.start, newState.zoom?.end));
  }

  if (state.dongleId === dongleId) {
    if (logId) dispatch(checkRoutesData());
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
