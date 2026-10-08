import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, selectDevice, fetchSharedDevice } from '.';
import { syncStateFromURL } from './history';

async function initProfile() {
  const { auth, account } = api;
  if (auth.isAuthenticated()) {
    try {
      return await account.getProfile();
    } catch (err) {
      if (err.resp && err.resp.status === 401) {
        await auth.logOut();
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
      }
    }
  }
  return null;
}

async function initDevices() {
  let devices = [];

  const { auth, devices: devicesApi } = api;
  if (auth.isAuthenticated()) {
    try {
      devices = devices.concat(await devicesApi.listDevices());
    } catch (err) {
      if (!err.resp || err.resp.status !== 401) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
      }
    }
  }

  return devices;
}

export default function init() {
  return async (dispatch, getState) => {
    let state = getState();
    if (state.dongleId && !state.routes) {
      dispatch(checkLastRoutesData());
    }

    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    if (profile) Sentry.setUser({ id: profile.id });

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });

    state = getState();
    if (!devices.length) return;

    if (!state.dongleId) {
      const pathname = state.router.location.pathname;
      if (pathname === '/') {
        const remembered = window.localStorage.getItem('selectedDongleId');
        const device = state.devices.find((device) => device.dongle_id === remembered) || state.devices[0];
        dispatch(selectDevice(device.dongle_id));
      } else {
        dispatch(syncStateFromURL(pathname));
      }
    } else {
      const device = devices.find((device) => device.dongle_id === state.dongleId);
      if (device) {
        dispatch(primeFetchSubscription(state.dongleId, device, profile));
      } else {
        dispatch(fetchSharedDevice(state.dongleId));
      }
    }
  }
}
