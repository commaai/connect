import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = (pathname) => async (dispatch, getState) => {
  const state = getState();
  const parsed = parseURL(pathname);

  let selectedDongleId = parsed.dongleId ?? state.dongleId;
  if (!selectedDongleId && state.devices?.length) {
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = state.devices.find((device) => device.dongle_id === remembered) || state.devices[0];
    selectedDongleId = device.dongle_id;
  }

  const destination = { ...parsed, dongleId: selectedDongleId };
  const { page, dongleId, range } = destination;
  const deviceChanged = state.dongleId !== dongleId;
  const isCurrent = () => getState().router.location.pathname === pathname;

  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination,
  });

  const updated = getState();
  if (state.zoom !== updated.zoom || state.selectedRouteId !== updated.selectedRouteId) {
    const { start, end } = updated.zoom || {};

    if (!updated.loop || !updated.loop.startTime || !updated.loop.duration
      || updated.loop.startTime < start
      || updated.loop.startTime + updated.loop.duration > end
      || updated.loop.duration < end - start) {
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
  }

  const isDrive = page === 'drive';
  if (deviceChanged) {
    dispatch(checkLastRoutesData());
  } else if (dongleId && isDrive) {
    dispatch(checkRoutesData());
  }

  if (page === 'legacy-drive') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (!isCurrent()) return;

      const logId = routesData?.[0]?.fullname?.split('|')[1];
      if (logId) dispatch(replace(buildURL({ page: 'drive', dongleId, logId, range: null })));
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  }
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return;

  next(action); // must be first, otherwise breaks history

  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateFromURL(action.payload.location.pathname));
  }
};
