import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { destinationFromUrl } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import {
  checkLastRoutesData, checkRoutesData, currentPathname, fetchDeviceOnline, navigateTo, primeFetchSubscription,
} from './index';

// the root URL opens the last used device, or the first one in the order the API returned
export function openDefaultDevice(devices = null) {
  return (dispatch, getState) => {
    const state = getState();
    devices = devices || state.devices;
    if (!devices?.length || destinationFromUrl(currentPathname(state)).page !== 'root') {
      return;
    }
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = devices.find((d) => d.dongle_id === remembered) || devices[0];
    dispatch(navigateTo({ page: 'dashboard', dongleId: device.dongle_id }, { replace: true }));
  };
}

function openLegacyRange(pathname, { dongleId, zoom }) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, zoom.start, zoom.end);
      const logId = routes?.[0]?.fullname.split('|')[1];
      if (logId && currentPathname(getState()) === pathname) {
        dispatch(navigateTo({ page: 'drive', dongleId, logId }, { replace: true }));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

export function applyUrl(pathname) {
  return (dispatch, getState) => {
    const prev = getState();
    const destination = destinationFromUrl(pathname);
    dispatch({ type: Types.ACTION_APPLY_DESTINATION, destination });
    const state = getState();

    if (destination.page === 'root') {
      dispatch(openDefaultDevice());
    } else if (destination.page === 'legacy') {
      dispatch(openLegacyRange(pathname, destination));
    }

    if (state.dongleId !== prev.dongleId) {
      if (prev.dongleId) {
        webrtcConnectionManager.disconnect();
      }
      window.localStorage.setItem('selectedDongleId', state.dongleId);
      if ((state.device && !state.device.shared) || state.profile?.superuser) {
        dispatch(primeFetchSubscription(state.dongleId, state.device));
        dispatch(fetchDeviceOnline(state.dongleId));
      }
      dispatch(checkLastRoutesData());
    } else {
      dispatch(checkRoutesData());
    }

    const { zoom } = state;
    if (zoom && (zoom.start !== prev.zoom?.start || zoom.end !== prev.zoom?.end
      || state.selectedRouteId !== prev.selectedRouteId)) {
      dispatch(resetPlayback());
      dispatch(selectLoop(zoom.start, zoom.end));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};
