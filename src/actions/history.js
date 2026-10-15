import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { destinationFromUrl, urlForDestination } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, checkLastRoutesData, fetchDeviceOnline, fetchSharedDevice, primeFetchSubscription } from './index';
import { ACTION_APPLY_DESTINATION, ACTION_STARTUP_DATA } from './types';

// The only way to navigate: build the destination's URL and push it. syncStateFromUrl then applies it.
export const navigateTo = ({ dongleId, page = 'dashboard', logId = null, range = null }) => (dispatch, getState) => {
  const state = getState();
  const route = logId && state.routes?.find((r) => r.log_id === logId);
  const wholeDrive = range && range.start === 0 && range.end === route?.duration;
  const url = urlForDestination({
    dongleId: dongleId ?? state.dongleId,
    page: logId ? 'drive' : page,
    logId,
    range: wholeDrive ? null : range,
  });
  if (url !== state.router.location.pathname) dispatch(push(url));
};

// apiFirstDongleId: devices are stored sorted, but the default is the first one the API returned
function defaultDongleId({ dongleId, devices }, apiFirstDongleId) {
  if (dongleId || devices.length === 0) return dongleId;
  const remembered = window.localStorage.getItem('selectedDongleId');
  return devices.some((d) => d.dongle_id === remembered) ? remembered : apiFirstDongleId ?? devices[0].dongle_id;
}

const loopMatches = (loop, zoom) => loop?.startTime === zoom.start && loop.duration === zoom.end - zoom.start;

export const syncStateFromUrl = (apiFirstDongleId) => async (dispatch, getState) => {
  const state = getState();
  if (state.devices === null) return; // wait for ACTION_STARTUP_DATA

  const { pathname, search } = state.router.location;
  const destination = destinationFromUrl(pathname);
  const dongleId = destination.dongleId || defaultDongleId(state, apiFirstDongleId);
  const redirect = (to) => dispatch(replace({ pathname: urlForDestination(to), search }));

  if (destination.page === 'not-found' || (destination.page === 'root' && dongleId)) {
    return redirect({ dongleId });
  }
  if (destination.page === 'drive' && pathname !== urlForDestination(destination)) {
    return redirect(destination);
  }
  if (destination.page === 'legacy-drive') {
    const { start, end } = destination.range;
    const routes = await api.routes.getRoutesSegments(dongleId, start, end).catch((err) => {
      console.error('Failed to resolve legacy drive URL', err);
    });
    if (getState().router.location.pathname !== pathname) return; // navigated away meanwhile
    const logId = routes?.[0]?.fullname.split('|')[1];
    if (logId) return redirect({ page: 'drive', dongleId, logId });
  }

  const deviceChanged = dongleId !== state.dongleId;
  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    dongleId,
    routeId: destination.page === 'drive' ? destination.logId : null,
    range: destination.page === 'drive' ? destination.range : null,
  });

  const { zoom, selectedRouteId } = getState();
  if ((zoom !== state.zoom || selectedRouteId !== state.selectedRouteId) && !(zoom && loopMatches(state.loop, zoom))) {
    dispatch(resetPlayback());
    dispatch(selectLoop(zoom?.start, zoom?.end));
  }

  if (!deviceChanged) {
    if (selectedRouteId) dispatch(checkRoutesData());
    return;
  }

  window.localStorage.setItem('selectedDongleId', dongleId);
  const { device, profile } = getState();
  if ((device && !device.shared) || profile?.superuser) {
    dispatch(primeFetchSubscription());
    dispatch(fetchDeviceOnline(dongleId));
  }
  if (!state.devices.some((d) => d.dongle_id === dongleId) && api.auth.isAuthenticated()) {
    dispatch(fetchSharedDevice(dongleId));
  }
  dispatch(checkLastRoutesData());
};

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return undefined;
  const prevPathname = getState().router?.location.pathname;
  const result = next(action);
  const pathChanged = action.type === LOCATION_CHANGE && action.payload.location.pathname !== prevPathname;
  if (action.type === ACTION_STARTUP_DATA || pathChanged) dispatch(syncStateFromUrl(action.devices?.[0]?.dongle_id));
  return result;
};
