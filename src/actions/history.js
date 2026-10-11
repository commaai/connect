import { LOCATION_CHANGE, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { parseUrl, urlFor } from '../url';
import { checkLastRoutesData, checkRoutesData, fetchDeviceOnline, fetchSelectedRoute, fetchSharedDevice, primeFetchSubscription } from './index';
import { ACTION_STARTUP_DATA } from './types';
import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { hasRoutesData } from '../timeline/segments';
import { webrtcConnectionManager } from '../utils/webrtc';

// once per app load: the profile and the device list
export const loadStartupData = () => async (dispatch) => {
  const { auth, account, devices } = api;
  const [profile, list] = !auth.isAuthenticated() ? [null, []] : await Promise.all([
    account.getProfile().catch(async (err) => {
      if (err.resp?.status === 401) await auth.logOut();
      else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
      return null;
    }),
    devices.listDevices().catch((err) => {
      if (err.resp?.status !== 401) Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
      return [];
    }),
  ]);
  if (profile) Sentry.setUser({ id: profile.id });
  dispatch({ type: ACTION_STARTUP_DATA, profile, devices: list });
};

// `/` (and `/demo`) open the last used device, once the devices are known
function openDefaultDevice(dispatch, devices) {
  if (!devices?.length) return;
  const stored = window.localStorage.getItem('selectedDongleId');
  const dongleId = devices.some((d) => d.dongle_id === stored) ? stored : devices[0].dongle_id;
  dispatch(replace(urlFor({ page: 'dashboard', dongleId })));
}

// old `/:dongleId/:startMs/:endMs` links are replaced with the drive they point at
function openLegacyLink(dispatch, getState, { dongleId, zoom }) {
  const { pathname } = getState().router.location;
  api.routes.getRoutesSegments(dongleId, zoom.start, zoom.end).then((routes) => {
    if (routes?.length && getState().router.location.pathname === pathname) {
      const logId = routes[0].fullname.split('|')[1];
      dispatch(replace(urlFor({ page: 'drive', dongleId, logId })));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

// a device missing from your list is fetched on its own (shared with you)
function loadDevice(dispatch, { dongleId, devices, profile }) {
  const device = devices?.find((d) => d.dongle_id === dongleId);
  if (devices?.length && !device) {
    dispatch(fetchSharedDevice(dongleId));
  } else if ((device && !device.shared) || profile?.superuser) {
    dispatch(primeFetchSubscription(dongleId, device));
    dispatch(fetchDeviceOnline(dongleId));
  }
}

function onDeviceChange(dispatch, prev, state) {
  window.localStorage.setItem('selectedDongleId', state.dongleId);
  if (prev.dongleId) {
    webrtcConnectionManager.disconnect();
  }
  loadDevice(dispatch, state);
  dispatch(checkLastRoutesData());
}

// same device: fetch only what this page needs and is not loaded yet
function loadMissing(dispatch, state) {
  if (!hasRoutesData(state)) {
    dispatch(checkRoutesData());
  } else if (state.selectedRouteId && !state.currentRoute) {
    dispatch(fetchSelectedRoute());
  }
}

function onZoomChange(dispatch, { zoom, loop }) {
  if (!zoom) {
    dispatch(selectLoop(null, null));
  } else if (loop?.startTime !== zoom.start || loop?.duration !== zoom.end - zoom.start) {
    dispatch(resetPlayback());
    dispatch(selectLoop(zoom.start, zoom.end));
  }
}

// The reducer has already applied the url; this only does the side effects it needs.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  const prev = getState();
  const result = next(action);
  if (action?.type !== LOCATION_CHANGE && action?.type !== ACTION_STARTUP_DATA) {
    return result;
  }

  const state = getState();
  const view = parseUrl(state.router.location.pathname);
  if (view.page === 'root') {
    openDefaultDevice(dispatch, action.devices || state.devices);
  } else if (action.type === ACTION_STARTUP_DATA) {
    if (state.dongleId) loadDevice(dispatch, state);
  } else {
    if (view.page === 'legacy') openLegacyLink(dispatch, getState, view);
    if (state.dongleId !== prev.dongleId) onDeviceChange(dispatch, prev, state);
    else if (state.dongleId) loadMissing(dispatch, state);
    if (state.zoom !== prev.zoom) onZoomChange(dispatch, state);
  }
  return result;
};
