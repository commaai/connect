import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { api } from '../api/backend';
import { destinationFromUrl, urlForDestination } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import { checkRoutesData, checkLastRoutesData, fetchDeviceOnline, primeFetchSubscription } from './index';

export const navigateTo = (destination) => push(urlForDestination(destination));
export const applyDestination = (destination) => ({ type: Types.ACTION_APPLY_DESTINATION, destination });

// Keep in-flight startup requests per store, including when navigation changes
// during startup. No page transition needs to reload the account/device list.
const startupRequests = new WeakMap();
async function loadStartupData(dispatch, getState) {
  if (!startupRequests.has(getState)) {
    const request = Promise.all([
      api.account.getProfile().catch(async (err) => {
        if (err?.resp?.status === 401) await api.auth.logOut();
        else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
        return null;
      }),
      api.devices.listDevices().catch((err) => {
        if (err?.resp?.status !== 401) Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
        return [];
      }),
    ]).then(([profile, devices]) => {
      dispatch({ type: Types.ACTION_STARTUP_DATA, profile, devices });
      if (profile) Sentry.setUser({ id: profile.id });
      return [profile, devices];
    }).finally(() => startupRequests.delete(getState));
    startupRequests.set(getState, request);
  }
  return await startupRequests.get(getState);
}

// One pipeline for cold entry, PUSH, REPLACE and browser back/forward:
// parse → apply the destination → load missing data. Async results must still
// belong to the active history entry before they can navigate or update a page.
export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const location = getState().router?.location;
  const isCurrent = () => location
    ? getState().router?.location === location
    : window.location.pathname === pathname;
  const destination = destinationFromUrl(pathname);
  const authenticated = api.auth.isAuthenticated();
  let startupData = null;
  if (authenticated && getState().devices === null) startupData = await loadStartupData(dispatch, getState);
  if (!isCurrent()) return;

  const { devices, profile } = getState();
  if (destination.kind === 'root' && authenticated) {
    const remembered = localStorage.getItem('selectedDongleId');
    const startupDevices = startupData?.[1] || devices;
    const device = startupDevices?.find((candidate) => candidate.dongle_id === remembered) || startupDevices?.[0];
    if (device) {
      dispatch(replace(urlForDestination({ kind: 'dashboard', dongleId: device.dongle_id })));
      return;
    }
  }

  // Account pages retain the current device and its loaded dashboard data.
  if (destination.kind === 'referrals') destination.dongleId = getState().dongleId;
  const { dongleId } = destination;
  const deviceChanged = getState().dongleId !== (dongleId ?? null);
  if (deviceChanged && getState().dongleId) webrtcConnectionManager.disconnect();
  dispatch(applyDestination(destination));
  if (!dongleId || destination.kind === 'referrals') return;
  if (authenticated) localStorage.setItem('selectedDongleId', dongleId);

  if (destination.kind === 'legacy') {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, destination.start, destination.end);
      if (!isCurrent()) return;
      const logId = routes?.[0]?.fullname?.split('|')[1];
      if (logId) dispatch(replace(urlForDestination({ kind: 'drive', dongleId, logId })));
      else dispatch(applyDestination({ kind: 'not-found' }));
    } catch (err) {
      if (!isCurrent()) return;
      Sentry.captureException(err, { fingerprint: 'url_legacy_route' });
      dispatch(applyDestination({ kind: 'not-found' }));
    }
    return;
  }

  if (destination.kind === 'drive') {
    dispatch(checkRoutesData());
  } else if (authenticated && (deviceChanged || getState().routes == null)) {
    dispatch(checkLastRoutesData());
  }

  if (!authenticated) return;
  let device = devices?.find((candidate) => candidate.dongle_id === dongleId);
  if (!device) {
    try {
      device = await api.devices.fetchDevice(dongleId);
      if (!isCurrent()) return;
      dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });
    } catch (err) {
      if (!isCurrent()) return;
      // Public drives remain viewable even when device details are private.
      if (destination.kind !== 'drive') dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND });
      if (![403, 404].includes(err?.resp?.status)) Sentry.captureException(err, { fingerprint: 'url_fetch_device' });
      return;
    }
  }
  if (deviceChanged) {
    dispatch(fetchDeviceOnline(dongleId));
    dispatch(primeFetchSubscription(dongleId, device, profile));
  }
};

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return undefined;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(syncStateFromUrl(action.payload.location.pathname));
  return result;
};
