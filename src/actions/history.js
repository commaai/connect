import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback, selectLoop } from '../timeline/playback';

export const syncStateFromURL = (pathname, defaultDongleId) => async (dispatch, getState) => {
  const state = getState();
  if (state.devices === null) return;

  const parsed = parseURL(pathname);

  let selectedDongleId = parsed.dongleId ?? state.dongleId;
  if (!selectedDongleId && state.devices?.length) {
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = state.devices.find((device) => device.dongle_id === remembered)
      || state.devices.find((device) => device.dongle_id === defaultDongleId)
      || state.devices[0];
    selectedDongleId = device.dongle_id;
  }

  if (parsed.page === 'root' && selectedDongleId) {
    dispatch(replace(buildURL({ page: 'dashboard', dongleId: selectedDongleId })));
    return;
  }
  const destination = { ...parsed, dongleId: selectedDongleId };
  const { page, dongleId, range } = destination;
  const deviceChanged = state.dongleId !== dongleId;

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
    dispatch(checkLastRoutesData());
  } else if (dongleId && page === 'drive') {
    dispatch(checkRoutesData());
  }

  if (page === 'legacy-drive') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, range.start, range.end);
      if (getState().router.location.pathname !== pathname) return;

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
