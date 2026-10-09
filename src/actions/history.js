import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { isPublic, keepingQuery, urlForDestination, urlWithDialog } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import {
  checkRoutesData, fetchDeviceOnline, fetchSharedDevice, primeFetchSubscription, routeFromApi, signInHere,
} from './index';
import * as Types from './types';

// other query values stay on the same page, or when replacing on the same device
export function navigateTo(to, { replace: replacing = false, state } = {}) {
  return (dispatch, getState) => {
    const { router: { location }, dongleId, nav } = getState();
    const sameDevice = (to.dongleId ?? dongleId) === dongleId;
    const samePage = to.page === nav.page && sameDevice && (to.logId ?? null) === nav.logId;
    const written = urlForDestination({ dongleId, ...to });
    const url = (replacing && sameDevice) || samePage ? keepingQuery(written, location.search) : written;
    if (url !== location.pathname + location.search) {
      dispatch(replacing ? replace(url, state ?? location.state) : push(url, state));
    }
  };
}

// the zooms we came through live in the history entry, so zoom out survives a reload
export const zoomIn = (range) => (dispatch, getState) => {
  const { nav, router: { location } } = getState();
  const zooms = [...(location.state?.zooms || []), nav.range];
  dispatch(navigateTo({ ...nav, range }, { state: { zooms } }));
};

export const zoomOut = () => (dispatch, getState) => {
  const { nav, router: { location } } = getState();
  const zooms = location.state?.zooms || [];
  dispatch(navigateTo({ ...nav, range: zooms.at(-1) ?? null }, { state: { zooms: zooms.slice(0, -1) } }));
};

export const showDialog = (dialog, value = true) => (dispatch, getState) => {
  const { location } = getState().router;
  const url = urlWithDialog(location, dialog, value);
  if (url !== location.pathname + location.search) {
    dispatch(push(url, { ...location.state, dialog }));
  }
};

// go back if this tab opened the dialog, otherwise (a link) replace
let closing = null; // a double tap only goes back once
export const closeDialog = (dialog) => (dispatch, getState) => {
  const { nav, router: { location } } = getState();
  if (closing === nav) {
    return;
  }
  closing = nav;
  if (location.state?.dialog === dialog) {
    dispatch(goBack());
  } else {
    dispatch(replace(urlWithDialog(location, dialog, null), location.state));
  }
};

// legacy branch: /:dongleId/:startMs/:endMs → resolve to the drive url
function openLegacyLink(nav) {
  return async (dispatch, getState) => {
    try {
      const [found] = await api.routes.getRoutesSegments(nav.dongleId, nav.range.start, nav.range.end);
      if (getState().nav !== nav) {
        return;
      }
      if (found) {
        const route = routeFromApi(found);
        dispatch({ type: Types.ACTION_DRIVE_METADATA, fullname: route.fullname, route });
        dispatch(navigateTo({ ...nav, page: 'drive', logId: route.log_id, range: null }, { replace: true }));
      } else if (!api.auth.isAuthenticated()) {
        signInHere(getState); // probably a private drive
      } else {
        dispatch({ type: Types.ACTION_URL_NOT_FOUND, nav });
      }
    } catch (err) {
      if (!api.auth.isAuthenticated() && [401, 403].includes(err.resp?.status) && getState().nav === nav) {
        signInHere(getState);
      } else {
        console.error('Error fetching routes data for log ID conversion', err);
        dispatch({ type: Types.ACTION_URL_NOT_FOUND, nav });
      }
    }
  };
}

const visible = (nav) => api.auth.isAuthenticated() || isPublic(nav);

const routesWanted = ({ nav }) => (
  ['dashboard', 'drive'].includes(nav?.page) && visible(nav) ? `${nav.dongleId} ${nav.logId}` : null);

// the actions that can move the url's page, device, or drive
const SYNC_ACTIONS = [
  LOCATION_CHANGE, Types.ACTION_STARTUP_DATA, Types.ACTION_UPDATE_DEVICES, Types.ACTION_DRIVE_METADATA, Types.ACTION_ROUTES_METADATA,
];

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  const before = getState();
  const result = next(action);
  const state = getState();
  const { nav, dongleId, devices, profile, zoom, router: { location } } = state;
  if (!nav || !SYNC_ACTIONS.includes(action.type)) {
    return result;
  }

  // redirect branch: root → its device, legacy → its drive, anything else → how urlForDestination writes it
  const moved = action.type === LOCATION_CHANGE;
  let redirect;
  if (nav.page === 'root') {
    if (dongleId && (moved || dongleId !== before.dongleId)) {
      redirect = navigateTo({ ...nav, page: 'dashboard', dongleId }, { replace: true });
    }
  } else if (nav.page === 'legacy') {
    if (moved && visible(nav)) redirect = openLegacyLink(nav);
  } else if (moved && nav.page !== 'not-found') {
    const [canonical] = urlForDestination(nav).split('?');
    if (canonical !== location.pathname) {
      redirect = replace(canonical + location.search, location.state);
    }
  }
  // redirects wait for this navigation to finish, or react-router falls behind
  if (redirect) {
    Promise.resolve().then(() => {
      if (getState().nav === nav) {
        dispatch(redirect);
      }
    });
  }

  if (dongleId !== before.dongleId && before.dongleId) {
    webrtcConnectionManager.disconnect();
  }

  // device branch: remember it if it's ours, load what the dashboard shows
  if (dongleId && devices && (dongleId !== before.dongleId || !before.devices)) {
    const device = devices.find((d) => d.dongle_id === dongleId);
    if (device) {
      window.localStorage.setItem('selectedDongleId', dongleId);
    }
    if ((device && !device.shared) || profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }
    if (!device && api.auth.isAuthenticated()) {
      dispatch(fetchSharedDevice(dongleId));
    }
  }

  // drive branch: a new drive or range plays from its start
  if (zoom !== before.zoom) {
    dispatch(selectLoop(zoom?.start ?? null, zoom?.end ?? null));
    dispatch(resetPlayback());
  }

  if (routesWanted(state) && routesWanted(state) !== routesWanted(before)) {
    dispatch(checkRoutesData());
  }
  return result;
};
