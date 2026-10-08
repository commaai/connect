import { LOCATION_CHANGE, goBack, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { parseLocation, urlFor, withModal } from '../url';
import { webrtcConnectionManager } from '../utils/webrtc';
import { checkRoutesData, fetchDeviceOnline, fetchSharedDevice, primeFetchSubscription } from './index';
import { ACTION_STARTUP_DATA } from './types';

function homeDongleId(devices) {
  const stored = window.localStorage.getItem('selectedDongleId');
  return devices.some((device) => device.dongle_id === stored) ? stored : devices[0].dongle_id;
}

function loadDevice(dongleId, startup) {
  return (dispatch, getState) => {
    const { devices, profile } = getState();
    window.localStorage.setItem('selectedDongleId', dongleId);

    const device = devices.find((d) => d.dongle_id === dongleId);
    if (!device) {
      if (profile) {
        dispatch(fetchSharedDevice(dongleId));
      }
    } else if (!device.shared || profile?.superuser) {
      dispatch(primeFetchSubscription(dongleId, device));
      // the device list fetched at startup already has a fresh online status
      if (!startup) {
        dispatch(fetchDeviceOnline(dongleId));
      }
    }
  };
}

function resolveLegacyRange(dongleId, { start, end }, pathname) {
  return async (dispatch, getState) => {
    let routes;
    try {
      routes = await api.routes.getRoutesSegments(dongleId, start, end);
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
      return;
    }
    // the user may have navigated away while this was loading
    const { location } = getState().router;
    if (routes?.length && location.pathname === pathname) {
      const drivePath = urlFor({ page: 'drive', dongleId, logId: routes[0].fullname.split('|')[1] });
      dispatch(replace({ pathname: drivePath, search: location.search, hash: location.hash }));
    }
  };
}

// Loads what the current location needs. Runs after every location change, and once startup data arrives.
export function reconcile(prev) {
  return (dispatch, getState) => {
    const state = getState();
    const { location } = state.router;
    const nav = parseLocation(location);

    if (prev.dongleId && prev.dongleId !== nav.dongleId) {
      webrtcConnectionManager.disconnect();
    }

    if (!state.devices) {
      // routes need only the URL, so they load without waiting for the profile and devices.
      // Signed out, only a public drive can load.
      if (nav.page === 'drive' || api.auth.isAuthenticated()) {
        dispatch(checkRoutesData());
      }
      return;
    }
    const startup = !prev.devices;

    if (nav.page === 'home') {
      if (nav.returnTo) {
        dispatch(replace(nav.returnTo));
      } else if (state.devices.length) {
        const pathname = urlFor({ page: 'dashboard', dongleId: homeDongleId(state.devices) });
        dispatch(replace({ pathname, search: location.search, hash: location.hash }));
      }
      return;
    }

    if (nav.dongleId && (startup || nav.dongleId !== prev.dongleId)) {
      dispatch(loadDevice(nav.dongleId, startup));
    }

    // the same rule as the drawer's settings button
    if (nav.modal === 'settings') {
      const device = state.devices.find((d) => d.dongle_id === nav.modalDongleId);
      if (!device?.is_owner && !state.profile?.superuser) {
        dispatch(replace(withModal(location, null)));
      }
    }

    if (nav.legacyRange && (startup || location.pathname !== prev.router.location.pathname)) {
      dispatch(resolveLegacyRange(nav.dongleId, nav.legacyRange, location.pathname));
    }

    dispatch(checkRoutesData());
  };
}

// Pushes the page's URL unless it is already showing.
export function navigate(nav) {
  return (dispatch, getState) => {
    const url = urlFor(nav);
    const { pathname, search } = getState().router.location;
    if (url !== pathname + search) {
      dispatch(push(url));
    }
  };
}

// The entry is marked so closeModal knows the page is one step back.
export function openModal(modal, modalDongleId) {
  return (dispatch, getState) => {
    dispatch(push(withModal(getState().router.location, modal, modalDongleId), { modal: true }));
  };
}

// A modal opened from a link has no page behind it in history, so closing it replaces the URL.
export function closeModal() {
  return (dispatch, getState) => {
    const { location } = getState().router;
    dispatch(location.state?.modal ? goBack() : replace(withModal(location, null)));
  };
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  const prev = getState();
  const result = next(action);
  if (action.type === LOCATION_CHANGE || action.type === ACTION_STARTUP_DATA) {
    dispatch(reconcile(prev));
  }
  return result;
};
