import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseURL, buildURL } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice, pushTimelineRange } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

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
  const { page, dongleId, logId, range } = destination;
  const deviceChanged = state.dongleId !== dongleId;
  const isCurrent = () => getState().router.location.pathname === pathname;

  if (deviceChanged && state.dongleId) webrtcConnectionManager.disconnect();

  dispatch({
    type: ACTION_APPLY_DESTINATION,
    destination,
  });

  if (deviceChanged) {
    window.localStorage.setItem('selectedDongleId', dongleId);
    dispatch(pushTimelineRange(null, null, null, false));

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
  if (deviceChanged || isDrive || state.selectedRouteId) {
    const routeId = isDrive ? logId : null;
    const zoom = isDrive ? range : null;
    dispatch(pushTimelineRange(routeId, zoom?.start ?? null, zoom?.end ?? null, false));
  }

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
    const { location, action: historyAction } = action.payload;
    const page = parseURL(location.pathname).page;
    const pagePush = historyAction === 'PUSH' && ['dashboard', 'prime', 'stream'].includes(page);

    if (pagePush || ['POP', 'REPLACE'].includes(historyAction)) {
      dispatch(syncStateFromURL(location.pathname));
    }
  }
};
