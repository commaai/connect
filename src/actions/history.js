import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { api } from '../api/backend';
import { destinationFromUrl, settingsFromUrl, urlForDestination, urlForSettings } from '../url';
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
// /  (and /demo, on the demo backend)
// ├── referrals
// └── :dongleId
//     ├── dashboard
//     ├── :route
//     │   └── :start/:end
//     ├── :legacyStart/:legacyEnd
//     ├── stream
//     └── prime
// ?settings=:dongleId opens device settings over any of them
const stateMatches = (state, destination) => {
  if (state.dongleId !== destination.dongleId || state.page !== destination.page) return false;
  if (!destination.drive) return true;
  const { start, end } = destination.drive;
  const { zoom } = state;
  return state.selectedRouteId === destination.drive.logId
    && (start == null
      ? !zoom || (zoom.start === 0 && zoom.end === state.currentRoute?.duration)
      : zoom?.start === start && zoom?.end === end);
};

let startupRequest = null;

const loadStartupData = () => async (dispatch, getState) => {
  if (getState().devices !== null) return;
  if (!startupRequest) {
    startupRequest = Promise.all(api.auth.isAuthenticated() ? [
      api.account.getProfile().catch(async (err) => {
        if (err?.resp?.status === 401) await api.auth.logOut();
        else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
        return null;
      }),
      api.devices.listDevices().catch((err) => {
        if (err?.resp?.status !== 401) Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
        return [];
      }),
    ] : [null, []]).finally(() => { startupRequest = null; });
  }
  const [profile, devices] = await startupRequest;
  if (getState().devices === null) {
    dispatch({ type: Types.ACTION_STARTUP_DATA, profile, devices });
    if (profile) Sentry.setUser({ id: profile.id });
  }
};

// device branch: select the dongle, fetching it directly if not in the owned list.
const loadDevice = (dongleId) => async (dispatch, getState) => {
  await dispatch(loadStartupData());
  if (getState().dongleId !== dongleId) return;
  let device = getState().devices.find((candidate) => candidate.dongle_id === dongleId);
  if (device) {
    dispatch(fetchDeviceOnline(dongleId));
  } else {
    // try to fetch, maybe its a shared device!
    device = await api.devices.fetchDevice(dongleId).catch((err) => {
      if (![403, 404].includes(err?.resp?.status)) Sentry.captureException(err, { fingerprint: 'action_fetch_shared_device' });
      return null;
    });
    if (getState().dongleId !== dongleId) return;
    if (!device) {
      dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });
      return;
    }
    dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });
  }
  dispatch(primeFetchSubscription(dongleId, device, getState().profile));
};

export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const route = destinationFromUrl(pathname);
  const isCurrent = () => getState().router.location.pathname === pathname;
  const redirect = (to) => replace(urlForSettings({ pathname: to }, settingsFromUrl(getState().router.location.search)));

  const authenticated = api.auth.isAuthenticated();
  const startupData = dispatch(loadStartupData());

  // root branch: / → remembered device, first sorted device, or the no-device upsell.
  if (route.kind === 'root') {
    await startupData;
    if (!authenticated || !isCurrent()) return;
    const { devices } = getState();
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = devices.find((candidate) => candidate.dongle_id === remembered) || devices[0];
    if (!device) {
      dispatch(applyDestination({ dongleId: null, page: 'dashboard', drive: null }));
      return;
    }
    dispatch(redirect(`/${device.dongle_id}`));
    return;
  }

  // 404 for unrecognized paths outside a device
  if (route.kind === 'not-found' && !route.dongleId) {
    dispatch(applyDestination({ dongleId: null, page: 'not-found', drive: null }));
    return;
  }

  // referrals open over the selected device
  if (route.kind === 'referrals') return;

  const { dongleId } = route;
  if (getState().dongleId !== dongleId) {
    window.localStorage.setItem('selectedDongleId', dongleId);
    // TODO: write better redux and move this out
    if (getState().dongleId) webrtcConnectionManager.disconnect();
    if (authenticated) dispatch(loadDevice(dongleId));
  }

  // route branch: /:dongleId/:logId[/:start/:end]
  if (route.kind === 'drive') {
    const drive = { logId: route.logId, start: route.start, end: route.end };
    const destination = { dongleId, page: 'drive', drive };
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
    dispatch(checkRoutesData());
    return;
  }

  // legacy range branch: /:dongleId/:legacyStart/:legacyEnd → resolve to canonical route URL
  if (route.kind === 'legacy') {
    // the device's dashboard while the drive is looked up
    const destination = { dongleId, page: 'dashboard', drive: null };
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
    const routesData = await api.routes.getRoutesSegments(dongleId, route.start, route.end)
      .catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    if (!isCurrent()) return;
    const logId = routesData?.[0]?.fullname?.split('|')[1];
    if (logId) {
      // resolve to new url
      dispatch(redirect(`/${dongleId}/${logId}`));
      return;
    }
    dispatch(applyDestination({ dongleId, page: 'not-found', drive: null }));
    return;
  }

  if (!authenticated) return;

  // device page branch: /:dongleId, /:dongleId/prime, /:dongleId/stream, or a 404 under the device
  const destination = { dongleId, page: route.kind, drive: null };
  if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
  if (route.kind === 'dashboard') {
    // the first page of drives, or the list again after a linked drive replaced it
    dispatch(getState().limit ? checkRoutesData() : checkLastRoutesData());
  }
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
