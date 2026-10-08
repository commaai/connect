import { LOCATION_CHANGE, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { api } from '../api/backend';
import { DEMO_DONGLE_ID } from '../api/demo';
import { destinationFromUrl } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import {
  checkRoutesData,
  checkLastRoutesData,
  fetchDeviceOnline,
  primeFetchSubscription,
} from './index';

export const applyDestination = (destination) => ({
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

const stateMatches = (state, destination) => {
  if (state.dongleId !== destination.dongleId) return false;
  const navOpen = state.primeNav || state.streamNav || state.settingsNav || state.referralsNav;
  if (destination.page === 'prime') return state.primeNav;
  if (destination.page === 'stream') return state.streamNav;
  if (destination.page === 'settings') return state.settingsNav;
  if (destination.page === 'referrals') return state.referralsNav;
  if (destination.drive) {
    return !navOpen
      && state.urlRange?.logId === destination.drive.logId
      && (state.urlRange?.start ?? null) === destination.drive.start
      && (state.urlRange?.end ?? null) === destination.drive.end;
  }
  return !navOpen && state.urlRange == null;
};

let startupRequest = null;

const loadStartupData = () => {
  if (!startupRequest) {
    startupRequest = Promise.all([
      api.account.getProfile().catch(async (err) => {
        if (err?.resp?.status === 401) await api.auth.logOut();
        else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
        return null;
      }),
      api.devices.listDevices().catch((err) => {
        if (err?.resp?.status !== 401) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
        }
        return [];
      }),
    ]).finally(() => { startupRequest = null; });
  }
  return startupRequest;
};

// One function owns the whole url -> state mapping. Every location change,
// whether PUSH, POP, or REPLACE, resolves through this so state always
// converges to whatever the URL describes.
export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const destination = destinationFromUrl(pathname);
  const isCurrent = () => getState().router.location.pathname === pathname;

  const authenticated = api.auth.isAuthenticated();
  let startupDevices = null;
  if (authenticated && getState().devices === null) {
    const [profile, devices] = await loadStartupData();
    if (!isCurrent()) return;
    startupDevices = devices;
    if (getState().devices === null) {
      dispatch({ type: Types.ACTION_STARTUP_DATA, profile, devices });
      if (profile) Sentry.setUser({ id: profile.id });
    }
  }

  const { devices, profile } = getState();

  if (authenticated && destination.kind === 'root') {
    const remembered = window.localStorage.getItem('selectedDongleId');
    const unordered = startupDevices || devices;
    const device = unordered?.find((candidate) => candidate.dongle_id === remembered) || unordered?.[0];
    if (!device) {
      dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
      return;
    }
    dispatch(replace(`/${device.dongle_id}`));
    return;
  }

  if (destination.kind === 'not-found') {
    dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
    return;
  }

  if (destination.kind === 'referrals') {
    dispatch(applyDestination({ dongleId: getState().dongleId, page: 'referrals', drive: null }));
    return;
  }

  const dongleId = destination.kind === 'demo' ? DEMO_DONGLE_ID : destination.dongleId;
  const deviceChanged = getState().dongleId !== dongleId;

  // TODO: write better redux and move this out
  if (deviceChanged) webrtcConnectionManager.disconnect();

  // The URL names the device; fetch it directly if it isn't in the owned list
  // (shared devices) so deep links always land on the device.
  let device = devices?.find((candidate) => candidate.dongle_id === dongleId);
  if (authenticated) {
    if (device == null) {
      try {
        device = await api.devices.fetchDevice(dongleId);
        if (!isCurrent()) return;
      } catch (err) {
        if (err?.resp?.status === 404) {
          dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });
          return;
        }
        // 403: the device exists but isn't shared with this account; public
        // routes underneath it can still load, so keep syncing.
        if (err?.resp?.status !== 403) throw err;
      }
    }
    if (device) dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });

    dispatch(fetchDeviceOnline(dongleId));
    window.localStorage.setItem('selectedDongleId', dongleId);
  }

  if (destination.kind === 'legacy') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, destination.start, destination.end);
      if (!isCurrent()) return;
      const logId = routesData?.[0]?.fullname?.split('|')[1];
      if (logId) {
        dispatch(replace(`/${dongleId}/${logId}`));
        return;
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
      if (!isCurrent()) return;
    }
    dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
    return;
  }

  const drive = destination.kind === 'drive'
    ? { logId: destination.logId, start: destination.start, end: destination.end }
    : null;
  const page = {
    drive: 'drive',
    prime: 'prime',
    stream: 'stream',
    settings: 'settings',
    demo: 'dashboard',
    dashboard: 'dashboard',
  }[destination.kind];
  const next = { dongleId, page, drive };
  if (!stateMatches(getState(), next)) dispatch(applyDestination(next));

  if (authenticated && destination.kind === 'dashboard') {
    dispatch(primeFetchSubscription(dongleId, device, profile));
    if (deviceChanged || getState().routes == null) dispatch(checkLastRoutesData());
  }
  if (authenticated && destination.kind === 'prime' && deviceChanged) {
    dispatch(primeFetchSubscription(dongleId, device, profile));
  }
  if (destination.kind === 'drive') dispatch(checkRoutesData());
};

export function onHistoryMiddleware({ dispatch, getState }) {
  return (next) => (action) => {
    if (!action) return undefined;
    const result = next(action);
    if (action.type === LOCATION_CHANGE) {
      dispatch(syncStateFromUrl(action.payload.location.pathname));
    }
    return result;
  };
}
