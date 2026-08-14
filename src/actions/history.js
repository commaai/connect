import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import MyCommaAuth from '@commaai/my-comma-auth';
import * as Sentry from '@sentry/react';
import { account as Account, devices as Devices, drives as Drives } from '../api';
import { destinationFromUrl, urlForDestination } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import {
  checkRoutesData,
  checkLastRoutesData,
  fetchDeviceOnline,
  primeFetchSubscription,
} from './index';

export const navigateTo = (destination) => push(urlForDestination(destination));

export const applyDestination = (destination) => ({
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

// Route tree:
// /
// └── :dongleId
//     ├── dashboard
//     ├── :route
//     │   └── :start/:end
//     ├── :legacyStart/:legacyEnd
//     ├── stream
//     └── prime
const stateMatches = (state, destination) => {
  if (state.dongleId !== destination.dongleId) return false;
  if (destination.page === 'prime') return state.primeNav && !state.streamNav;
  if (destination.page === 'stream') return state.streamNav && !state.primeNav;
  if (destination.drive) {
    return !state.primeNav && !state.streamNav
      && state.segmentRange?.log_id === destination.drive.logId
      && state.segmentRange?.start === destination.drive.start
      && state.segmentRange?.end === destination.drive.end;
  }
  return !state.primeNav && !state.streamNav && state.segmentRange == null;
};

let startupRequest = null;

const loadStartupData = () => {
  if (!startupRequest) {
    startupRequest = Promise.all([
      Account.getProfile().catch(async (err) => {
        if (err?.resp?.status === 401) await MyCommaAuth.logOut();
        else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
        return null;
      }),
      Devices.listDevices().catch((err) => {
        if (err?.resp?.status !== 401) Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
        return [];
      }),
    ]).finally(() => { startupRequest = null; });
  }
  return startupRequest;
};

export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const route = destinationFromUrl(pathname);
  const isCurrent = () => window.location.pathname === pathname;
  let profile, devices = null;

  const authenticated = MyCommaAuth.isAuthenticated();

  if (authenticated && getState().devices === null) {
    [profile, devices] = await loadStartupData();
    if (!isCurrent()) return;
    if (getState().devices === null) {
      dispatch({ type: Types.ACTION_STARTUP_DATA, profile, devices });
      if (profile) Sentry.setUser({ id: profile.id });
    }
  }

  devices = getState().devices;
  profile = getState().profile;

  // root branch: / → remembered device, first sorted device, or the no-device upsell.
  if (authenticated && route.kind === 'root') {
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = devices?.find((candidate) => candidate.dongle_id === remembered) || devices?.[0];
    if (!device) {
      dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
      return;
    }
    dispatch(replace(`/${device.dongle_id}`));
    return;
  }

  if (route.kind === 'not-found') {
    dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
    return;
  }

  const { dongleId } = route;
  const deviceChanged = getState().dongleId !== dongleId;
  
  // TODO: write better redux and move this out
  if (deviceChanged) webrtcConnectionManager.disconnect();

  // device branch: select the dongle, fetching it directly if not in the owned list.
  let device = devices?.find((candidate) => candidate.dongle_id === dongleId);
  if (authenticated) {
    if (device == null) {
      try {
        device = await Devices.fetchDevice(dongleId); // try to fetch, maybe its a shared device!
        if (!isCurrent()) return;
      } catch (err) {
        if (err?.resp?.status === 404) {
          dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });
          return;
        }
        throw err;
      }
    }
    dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });
  }

  // online state is intentionally refreshed on every device URL synchronization.
  if (authenticated) dispatch(fetchDeviceOnline(dongleId));

  // route branch: /:dongleId/:logId[/:start/:end]
  if (route.kind === 'drive') {
    window.localStorage.setItem('selectedDongleId', dongleId);
    const drive = { logId: route.logId, start: route.start, end: route.end };
    const destination = { dongleId, page: 'drive', drive };
    if (!stateMatches(getState(), destination)) {
      dispatch(applyDestination(destination));
    }
    dispatch(checkRoutesData());
    return;
  }

  // legacy range branch: /:dongleId/:legacyStart/:legacyEnd → resolve to canonical route URL
  if (route.kind === 'legacy') {
    try {
      const routesData = await Drives.getRoutesSegments(dongleId, route.start, route.end);
      if (!isCurrent()) return;
      const logId = routesData?.[0]?.fullname?.split('|')[1];
      if (logId) {
        // resolve to new url
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

  // prime branch: /:dongleId/prime
  if (authenticated && route.kind === 'prime') {
    window.localStorage.setItem('selectedDongleId', dongleId);
    const destination = { dongleId, page: 'prime', drive: null };
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
    if (deviceChanged) dispatch(primeFetchSubscription(dongleId, device, profile));
    return;
  }

  // stream branch: /:dongleId/stream
  if (authenticated && route.kind === 'stream') {
    window.localStorage.setItem('selectedDongleId', dongleId);
    const destination = { dongleId, page: 'stream', drive: null };
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
    return;
  }

  // dashboard branch: /:dongleId
  if (authenticated && route.kind === 'dashboard') {
    window.localStorage.setItem('selectedDongleId', dongleId);
    const destination = { dongleId, page: 'dashboard', drive: null };
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
    dispatch(primeFetchSubscription(dongleId, device, profile));
    if (deviceChanged || getState().routes == null) dispatch(checkLastRoutesData());
    return;
  }

  // 404 for unrecognized paths
  dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
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
