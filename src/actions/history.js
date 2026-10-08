import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import { api, initBackend } from '../api/backend';
import { destinationFromUrl, urlForDestination, safeInternalPath } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback } from '../timeline/playback';
import * as Types from './types';
import {
  checkRoutesData,
  checkLastRoutesData,
  fetchDeviceOnline,
  primeFetchSubscription,
  selectTimeFilter,
} from './index';

// Navigate by formatting a destination into the one canonical URL shape.
export const navigateTo = (destination) => push(urlForDestination(destination));

export const applyDestination = (destination) => ({
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

const dashboardDestination = (dongleId) => ({ kind: 'dashboard', dongleId });

// True when the store already reflects the destination, so we can keep all of
// the cached domain data instead of re-applying it.
const stateMatches = (state, destination) => {
  if (state.dongleId !== (destination.dongleId ?? null)) {
    return false;
  }
  if (state.destinationKind !== destination.kind) {
    return false;
  }
  if (destination.kind === 'drive') {
    if (state.selectedRouteId !== destination.logId) {
      return false;
    }
    const zoom = state.zoom;
    if (destination.start == null) {
      // A range-less URL is the whole drive, which the store may not have
      // hydrated yet (routes still loading).
      return zoom == null || (zoom.start === 0 && zoom.end === state.currentRoute?.duration);
    }
    return zoom?.start === destination.start && zoom?.end === destination.end;
  }
  return true;
};

let startupRequest = null;

// Profile + device list are fetched once per app load, no matter how many
// navigations race to start them.
const loadStartupData = () => {
  if (!startupRequest) {
    startupRequest = Promise.all([
      api.account.getProfile().catch((err) => {
        if (err?.resp?.status === 401) {
          api.auth.logOut();
        } else {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
        }
        return null;
      }),
      api.devices.listDevices().catch((err) => {
        if (err?.resp?.status !== 401) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
        }
        return [];
      }),
    ]).finally(() => {
      startupRequest = null;
    });
  }
  return startupRequest;
};

// Landing place for `/` and `/demo`: a chosen device's dashboard. `/` redirects
// to the device URL; `/demo` keeps its shareable URL.
const applyEntryDestination = (dispatch, getState, destination, devices) => {
  if (destination.kind === 'root') {
    const search = getState().router?.location?.search ?? window.location.search;
    const redirect = safeInternalPath(new URLSearchParams(search).get('r'));
    if (redirect) {
      // Post-login deep link. Handling it here means it can never lose a race
      // with the remembered-device redirect below.
      dispatch(replace(redirect));
      return;
    }
  }

  const remembered = window.localStorage.getItem('selectedDongleId');
  const device = destination.kind === 'root'
    ? devices?.find((candidate) => candidate.dongle_id === remembered) || devices?.[0]
    : devices?.[0]; // demo exposes a single synthetic device

  if (!device) {
    dispatch(applyDestination(dashboardDestination(null)));
    return;
  }

  window.localStorage.setItem('selectedDongleId', device.dongle_id);
  if (destination.kind === 'demo') {
    const next = dashboardDestination(device.dongle_id);
    if (!stateMatches(getState(), next)) {
      dispatch(applyDestination(next));
    }
  } else {
    dispatch(replace(`/${device.dongle_id}`));
  }
};

// The single url -> state entry point. Runs for every LOCATION_CHANGE (initial
// load, PUSH, POP, REPLACE, refresh) and for nothing else.
export const syncStateFromUrl = (pathname) => async (dispatch, getState) => {
  const destination = destinationFromUrl(pathname);
  const isCurrent = () => (getState().router?.location?.pathname
    ?? window.location.pathname) === pathname;

  // /demo and its synthetic device use the demo backend; every other path uses
  // the real one. The backend is chosen once per page load, so this only warms
  // it for the initial URL.
  initBackend(pathname);

  const authenticated = api.auth.isAuthenticated();

  if (authenticated && getState().devices === null) {
    const [profile, devices] = await loadStartupData();
    if (!isCurrent()) {
      return;
    }
    if (getState().devices === null) {
      dispatch({ type: Types.ACTION_STARTUP_DATA, profile, devices });
      if (profile) {
        Sentry.setUser({ id: profile.id });
      }
    }
  }

  const { devices, profile } = getState();

  // /referrals is a full-page view rendered straight from the URL; it still
  // needs the startup profile, loaded above.
  if (destination.kind === 'referrals') {
    return;
  }

  if (destination.kind === 'root' || destination.kind === 'demo') {
    applyEntryDestination(dispatch, getState, destination, devices);
    return;
  }

  if (destination.kind === 'not-found') {
    // Keep the current device selected so a stray URL doesn't evict cached data.
    dispatch(applyDestination({ kind: 'not-found', dongleId: getState().dongleId }));
    return;
  }

  const { dongleId } = destination;
  const deviceChanged = getState().dongleId !== dongleId;
  // A drive loads only its own route; a later list view must reload.
  const routeOnly = getState().routesMeta?.routeOnly === true;

  if (deviceChanged) {
    webrtcConnectionManager.disconnect();
  }

  // Resolve the device: owned list first, then a direct fetch for shared devices.
  let device = devices?.find((candidate) => candidate.dongle_id === dongleId) || null;
  if (authenticated && !device) {
    try {
      device = await api.devices.fetchDevice(dongleId);
      if (!isCurrent()) {
        return;
      }
    } catch (err) {
      if (err?.resp?.status !== 404) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'sync_fetch_device' });
      }
      dispatch({ type: Types.ACTION_DEVICE_NOT_FOUND, dongleId });
      return;
    }
  }
  if (authenticated && device) {
    if (devices?.some((candidate) => candidate.dongle_id === device.dongle_id)) {
      dispatch({ type: Types.ACTION_UPDATE_DEVICE, device });
    } else {
      // A shared device that isn't in the owned list stays out of the drawer.
      dispatch({ type: Types.ACTION_UPDATE_SHARED_DEVICE, dongleId, device });
    }
  }

  const canSeeDevice = Boolean(device && (!device.shared || profile?.superuser));
  if (authenticated && canSeeDevice && deviceChanged) {
    dispatch(fetchDeviceOnline(dongleId));
  }

  if (destination.kind === 'drive') {
    const drive = {
      kind: 'drive', dongleId, logId: destination.logId, start: destination.start, end: destination.end,
    };
    if (!stateMatches(getState(), drive)) {
      dispatch(applyDestination(drive));
      // Start the new selection from its beginning, keeping the user's speed.
      dispatch(resetPlayback());
    }
    window.localStorage.setItem('selectedDongleId', dongleId);
    const loaded = getState().routes?.some((route) => route.log_id === destination.logId);
    // A route outside the loaded list (Forward, pasted link, deep link) has to
    // be fetched explicitly; hasRoutesData would otherwise short-circuit.
    dispatch(checkRoutesData({ force: !loaded }));
    return;
  }

  if (destination.kind === 'legacy') {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, destination.start, destination.end);
      if (!isCurrent()) {
        return;
      }
      const log_id = routesData?.[0]?.fullname?.split('|')[1];
      if (log_id) {
        // Replace, so browser Back leaves the drive instead of re-running this.
        dispatch(replace(`/${dongleId}/${log_id}`));
        return;
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
      if (!isCurrent()) {
        return;
      }
    }
    dispatch(applyDestination({ kind: 'not-found', dongleId }));
    return;
  }

  const next = { kind: destination.kind, dongleId };
  if (!stateMatches(getState(), next)) {
    dispatch(applyDestination(next));
  }
  window.localStorage.setItem('selectedDongleId', dongleId);

  if (destination.kind === 'prime' && deviceChanged) {
    dispatch(primeFetchSubscription(dongleId, device, profile));
  }
  if (destination.kind === 'dashboard' || destination.kind === 'settings') {
    if (deviceChanged) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    }
    if (deviceChanged || getState().routes == null) {
      dispatch(checkLastRoutesData());
    } else if (routeOnly) {
      // The route-restricted load only contained the drive; reload the list.
      const { filter } = getState();
      dispatch(selectTimeFilter(filter.start, filter.end));
    }
  }
};

export function onHistoryMiddleware({ dispatch }) {
  return (next) => (action) => {
    if (!action) {
      return undefined;
    }
    const result = next(action);
    if (action.type === LOCATION_CHANGE) {
      dispatch(syncStateFromUrl(action.payload.location.pathname));
    }
    return result;
  };
}
