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

  const parsed = parseURL({ pathname });
  const { page, range } = parsed;

  if (page === 'not-found') {
    dispatch(replace('/'));
    return;
  }

  let dongleId = parsed.dongleId ?? state.dongleId;
  if (!dongleId && state.devices?.length) {
    const rememberedDongleId = window.localStorage.getItem('selectedDongleId');
    const selectedDevice = state.devices.find((device) => device.dongle_id === rememberedDongleId)
      || state.devices.find((device) => device.dongle_id === defaultDongleId)
      || state.devices[0];
    dongleId = selectedDevice.dongle_id;
  }

  if (page === 'root' && dongleId) {
    dispatch(replace(`/${dongleId}`));
    return;
  }

  const deviceChanged = state.dongleId !== dongleId;
  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination: { ...parsed, dongleId },
  });

  const updated = getState();
  const { zoom, loop, selectedRouteId } = updated;
  if (state.zoom !== zoom || state.selectedRouteId !== selectedRouteId) {
    const { start, end } = zoom || {};

    if (!loop?.startTime || !loop?.duration || loop.startTime < start
      || loop.startTime + loop.duration > end || loop.duration < end - start) {
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end));
    }
  }

  if (deviceChanged) {
    window.localStorage.setItem('selectedDongleId', dongleId);

    const device = getState().device;
    if ((device && !device.shared) || state.profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
    if (!device && state.devices && api.auth.isAuthenticated()) {
      dispatch(fetchSharedDevice(dongleId));
    }
    dispatch(checkLastRoutesData());
  } else if (dongleId && page === 'drive') {
    dispatch(checkRoutesData());
  }

  if (page === 'legacy-drive') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (getState().router.location.pathname !== pathname) return;

      const logId = routesData?.[0]?.fullname?.split('|')[1];
      if (logId) dispatch(replace(`/${dongleId}/${logId}`));
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
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
