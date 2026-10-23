import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = () => async (dispatch, getState) => {
  let state = getState();
  if (state.devices === null) return;

  const currentPath = state.router.location.pathname;
  let destination = parseURL(currentPath);

  if (destination.page === 'legacy-drive') {
    const { dongleId, range } = destination;
    const logId = await api.routes.getRoutesSegments(dongleId, range.start, range.end)
      .then((routes) => routes?.[0]?.fullname?.split('|')[1])
      .catch((err) => console.error('Failed to resolve legacy drive URL', err));

    if (logId) destination = { ...destination, page: 'drive', logId, range: null };
  }

  state = getState();
  const location = state.router.location;
  if (location.pathname !== currentPath) return;

  destination.dongleId ??= state.dongleId ?? state.devices[0]?.dongle_id ?? null;
  const resolvedPath = buildURL(destination) ?? location.pathname;
  if (location.pathname !== resolvedPath) {
    return dispatch(replace({
      pathname: resolvedPath,
      search: location.search,
      state: location.state,
    }));
  }

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination,
  });

  const newState = getState();
  const playbackChanged = state.zoom !== newState.zoom || state.selectedRouteId !== newState.selectedRouteId;
  if (playbackChanged) {
    dispatch(resetPlayback());
    dispatch(selectLoop(newState.zoom?.start, newState.zoom?.end));
  }

  // initialize the newly selected device.
  if (state.dongleId !== destination.dongleId) {
    if ((newState.device && !newState.device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription());
      dispatch(fetchDeviceOnline(destination.dongleId));
    }

    const isListed = state.devices?.some((device) => device.dongle_id === destination.dongleId);
    if (!isListed && api.auth.isAuthenticated()) {
      dispatch(fetchSharedDevice(destination.dongleId));
    }

    dispatch(checkLastRoutesData());
  } else if (destination.logId) { // load drive on current device
    dispatch(checkRoutesData());
  }
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
