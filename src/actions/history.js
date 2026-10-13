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

const stateMatches = (state, { dongleId, page, drive }) => {
  if (state.dongleId !== dongleId || state.page !== page) return false;
  if (!drive) return true;
  if (state.selectedRouteId !== drive.logId) return false;
  const { zoom } = state;
  if (drive.start == null) return !zoom || (zoom.start === 0 && zoom.end === state.currentRoute?.duration);
  return zoom?.start === drive.start && zoom?.end === drive.end;
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
const loadDevice = (dongleId, previousDongleId) => async (dispatch, getState) => {
  await dispatch(loadStartupData());
  if (getState().dongleId !== dongleId) return;
  let device = getState().devices.find((candidate) => candidate.dongle_id === dongleId);
  if (device) {
    if (previousDongleId) dispatch(fetchDeviceOnline(dongleId)); // the list's online state is from the page load
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

// Route tree:
// /  (and /demo, on the demo backend)
// ├── referrals
// └── :dongleId  (the dashboard)
//     ├── :route
//     │   └── :start/:end
//     ├── :legacyStart/:legacyEnd
//     ├── stream
//     └── prime
// ?settings=:dongleId opens device settings over any of them
export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const route = destinationFromUrl(pathname);
  const isCurrent = () => getState().router.location.pathname === pathname;
  const redirect = (to) => replace(urlForSettings({ pathname: to }, settingsFromUrl(getState().router.location.search)));
  const show = (destination) => {
    if (!stateMatches(getState(), destination)) dispatch(applyDestination(destination));
  };

  const authenticated = api.auth.isAuthenticated();
  const startupData = dispatch(loadStartupData());

  // root branch: / → remembered device, first sorted device, or the no-device upsell.
  if (route.kind === 'root') {
    await startupData;
    if (!authenticated || !isCurrent()) return;
    const { devices } = getState();
    const remembered = window.localStorage.getItem('selectedDongleId');
    const device = devices.find((candidate) => candidate.dongle_id === remembered) || devices[0];
    if (device) dispatch(redirect(`/${device.dongle_id}`));
    else show({ dongleId: null, page: 'dashboard', drive: null });
    return;
  }

  // 404 for unrecognized paths outside a device
  if (route.kind === 'not-found' && !route.dongleId) {
    show({ dongleId: null, page: 'not-found', drive: null });
    return;
  }

  // referrals open over the selected device
  if (route.kind === 'referrals') return;

  const { dongleId } = route;
  const previousDongleId = getState().dongleId;
  if (previousDongleId !== dongleId) {
    window.localStorage.setItem('selectedDongleId', dongleId);
    // TODO: write better redux and move this out
    if (webrtcConnectionManager.dongleId !== dongleId) webrtcConnectionManager.disconnect();
    if (authenticated) dispatch(loadDevice(dongleId, previousDongleId));
  }

  // route branch: /:dongleId/:logId[/:start/:end]
  if (route.kind === 'drive') {
    show({ dongleId, page: 'drive', drive: { logId: route.logId, start: route.start, end: route.end } });
    dispatch(checkRoutesData());
    return;
  }

  // legacy range branch: /:dongleId/:legacyStart/:legacyEnd → resolve to canonical route URL
  if (route.kind === 'legacy') {
    show({ dongleId, page: 'dashboard', drive: null }); // while the drive is looked up
    const routesData = await api.routes.getRoutesSegments(dongleId, route.start, route.end)
      .catch((err) => console.error('Error fetching routes data for log ID conversion', err));
    if (!isCurrent()) return;
    const logId = routesData?.[0]?.fullname?.split('|')[1];
    if (logId) dispatch(redirect(`/${dongleId}/${logId}`));
    else show({ dongleId, page: 'not-found', drive: null });
    return;
  }

  if (!authenticated) return;

  // device page branch: /:dongleId, /:dongleId/prime, /:dongleId/stream, or a 404 under the device
  show({ dongleId, page: route.kind, drive: null });
  if (route.kind === 'dashboard') {
    // the first page of drives, or the list again after a linked drive replaced it
    dispatch(getState().limit ? checkRoutesData() : checkLastRoutesData());
  }
};

export function onHistoryMiddleware({ dispatch }) {
  return (next) => (action) => {
    if (!action) return undefined;
    const result = next(action);
    if (action.type === LOCATION_CHANGE) {
      dispatch(syncStateFromUrl(action.payload.location.pathname));
    }
    return result;
  };
}
