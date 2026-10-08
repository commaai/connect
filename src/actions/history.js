import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { destinationFromUrl, urlForDestination } from '../url';
import { checkRoutesData, checkLastRoutesData, primeFetchSubscription, fetchDeviceOnline, fetchSharedDevice } from './index';
import { ACTION_APPLY_DESTINATION } from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

export const applyDestination = (destination) => ({ type: ACTION_APPLY_DESTINATION, destination });

export function hydrateDevice(dongleId) {
  return (dispatch, getState) => {
    const { devices, profile } = getState();
    if (!dongleId || !devices) {
      return;
    }
    const device = devices.find((d) => d.dongle_id === dongleId);
    if ((device && !device.shared) || profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
    if (!device) {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}

export function syncStateFromUrl(pathname) {
  return async (dispatch, getState) => {
    const urlDestination = destinationFromUrl(pathname);
    const state = getState();
    const { kind, dongleId, start, end } = urlDestination;
    if (kind === 'root') {
      const remembered = window.localStorage.getItem('selectedDongleId');
      const device = state.devices?.find((d) => d.dongle_id === remembered) || state.devices?.[0];
      if (device) {
        return dispatch(replace(`/${device.dongle_id}`));
      }
      if (state.dongleId) {
        webrtcConnectionManager.disconnect();
      }
      return dispatch(applyDestination({ kind: 'dashboard', dongleId: null }));
    }
    if (kind === 'not-found') {
      return dispatch(replace('/'));
    }
    if (kind === 'auth') {
      return;
    }

    let destination = urlDestination;
    if (kind === 'legacy') {
      const isCurrent = () => getState().router.location.pathname === pathname;
      let logId;
      try {
        const routes = await api.routes.getRoutesSegments(dongleId, start, end);
        const route = routes?.[0];
        logId = route?.fullname.split('|')[1];
      } catch (err) {
        console.error('Error fetching routes data for log ID conversion', err);
      }
      if (!isCurrent()) {
        return;
      }
      if (logId) {
        return dispatch(replace(urlForDestination({ kind: 'drive', dongleId, logId })));
      }
      destination = { kind: 'dashboard', dongleId };
    }

    dispatch(applyDestination(destination));
    const deviceChanged = state.dongleId !== dongleId;
    if (deviceChanged) {
      if (state.dongleId) {
        webrtcConnectionManager.disconnect();
      }
      dispatch(hydrateDevice(dongleId));
    }
    if (destination.logId) {
      dispatch(checkRoutesData());
    } else if (dongleId && (deviceChanged || !state.routes || state.limit === 0)) {
      dispatch(checkLastRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateFromUrl(action.payload.location.pathname));
  }
  return result;
};
