import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { buildUrl, parseUrl } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkLastRoutesData, fetchDeviceOnline, fetchSharedDevice, primeFetchSubscription } from './index';

// Every URL change comes through here, whether from a link, a redirect or the
// back button. By the time next(action) returns, the reducer has put the new
// location into the state (see reducers/location.js). What's left is to start
// loading whatever the new screen needs.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }
  if (action.type !== LOCATION_CHANGE) {
    return next(action);
  }

  const prev = getState();
  const result = next(action);
  const state = getState();

  if (state.dongleId !== prev.dongleId) {
    window.localStorage.setItem('selectedDongleId', state.dongleId);
    if (prev.dongleId) {
      webrtcConnectionManager.disconnect();
    }
    dispatch(loadDevice(state.dongleId));
  }
  if (state.zoom?.start !== prev.zoom?.start || state.zoom?.end !== prev.zoom?.end) {
    dispatch(resetPlayback());
    dispatch(selectLoop(state.zoom?.start, state.zoom?.end));
  }

  const { legacyRange } = parseUrl(action.payload.location.pathname);
  if (legacyRange) {
    dispatch(openLegacyRange(state.dongleId, legacyRange));
  }
  dispatch(openDefaultDevice(state.devices));

  return result;
};

function loadDevice(dongleId) {
  return (dispatch, getState) => {
    const { device, devices, profile } = getState();
    if ((device && !device.shared) || profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    } else if (devices && !device) {
      dispatch(fetchSharedDevice(dongleId));
    }
    dispatch(checkLastRoutesData());
  };
}

// Old links name a time range instead of a drive. Look up the drive and
// replace the URL with its own.
function openLegacyRange(dongleId, { start, end }) {
  return async (dispatch) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routes?.length) {
        dispatch(replace(buildUrl({ dongleId, logId: routes[0].fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// A URL without a device or page, like "/", opens the device you were looking
// at, or else the one picked last time, or else the first of your devices.
export function openDefaultDevice(devices) {
  return (dispatch, getState) => {
    const { dongleId, router } = getState();
    const location = parseUrl(router.location.pathname);
    if (location.dongleId || location.page || !devices?.length) {
      return;
    }

    const stored = window.localStorage.getItem('selectedDongleId');
    const fallback = devices.some((device) => device.dongle_id === stored) ? stored : devices[0].dongle_id;
    dispatch(replace(buildUrl({ dongleId: dongleId || fallback })));
  };
}
