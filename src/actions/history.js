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

const dashboard = { dongleId: null, page: 'dashboard', drive: null };

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
  // Unauthenticated sessions can only resolve public drive links; App renders
  // the login wall for everything else.
  if (!authenticated && destination.kind !== 'drive' && destination.kind !== 'legacy') return;

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

  if (destination.kind === 'root') {
    const remembered = window.localStorage.getItem('selectedDongleId');
    const unordered = startupDevices || devices;
    const device = unordered?.find((candidate) => candidate.dongle_id === remembered) || unordered?.[0];
    if (!device) {
      dispatch(applyDestination(dashboard));
      return;
    }
    dispatch(replace(`/${device.dongle_id}`));
    return;
  }

  if (destination.kind === 'not-found') {
    dispatch(applyDestination(dashboard));
    return;
  }

  if (destination.kind === 'referrals') {
    dispatch(applyDestination({ dongleId: getState().dongleId, page: 'referrals', drive: null }));
    return;
  }

  const dongleId = destination.kind === 'demo' ? DEMO_DONGLE_ID : destination.dongleId;
  const deviceChanged = getState().dongleId !== dongleId;

  // The URL names the device; fetch it directly if it isn't in the owned list
  // (shared devices) so deep links always land on the device.
  let device = devices?.find((candidate) => candidate.dongle_id === dongleId);
  let deviceNotFound = false;
  if (authenticated && device == null) {
    try {
      device = await api.devices.fetchDevice(dongleId);
    } catch (err) {
      if (!isCurrent()) return;
      if (err?.resp?.status === 404 || err?.resp?.status === 403) {
        // The device is gone, or exists but isn't shared with this account.
        // Public routes underneath it still load via the drive path, which
        // does not need a device object.
        deviceNotFound = true;
      } else {
        throw err;
      }
    }
    if (!isCurrent()) return;
    if (device) dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });
  }

  if (destination.kind === 'legacy') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, destination.start, destination.end);
      if (!isCurrent()) return;
      const route = routesData?.[0];
      const logId = route?.fullname?.split('|')[1];
      if (logId) {
        const routeStart = route.start_time_utc_millis;
        const routeEnd = routeStart + route.duration;
        const ranged = destination.start > routeStart || destination.end < routeEnd;
        dispatch(replace(ranged
          ? `/${dongleId}/${logId}/${Math.floor((destination.start - routeStart) / 1000)}/${Math.ceil((destination.end - routeStart) / 1000)}`
          : `/${dongleId}/${logId}`));
        return;
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
      if (!isCurrent()) return;
    }
    dispatch(applyDestination(dashboard));
    return;
  }

  const next = {
    dongleId,
    page: destination.kind === 'demo' ? 'dashboard' : destination.kind,
    drive: destination.drive ?? null,
  };
  if (!stateMatches(getState(), next)) {
    // TODO: write better redux and move this out
    if (deviceChanged) {
      webrtcConnectionManager.disconnect();
      if (device) window.localStorage.setItem('selectedDongleId', dongleId);
    }
    dispatch(applyDestination(next));
    if (deviceNotFound) dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });

    if (next.page === 'drive') dispatch(checkRoutesData());
    if (authenticated) {
      if (deviceChanged && device) {
        dispatch(fetchDeviceOnline(dongleId));
        dispatch(primeFetchSubscription(dongleId, device, profile));
      }
      if (next.page === 'dashboard' && getState().routes == null) dispatch(checkLastRoutesData());
    }
  } else if (deviceNotFound) {
    dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });
  }
};

export function onHistoryMiddleware({ dispatch, getState }) {
  return (next) => (action) => {
    const result = next(action);
    if (action.type === LOCATION_CHANGE) {
      dispatch(syncStateFromUrl(action.payload.location.pathname));
    }
    return result;
  };
}
