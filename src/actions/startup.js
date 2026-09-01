import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import {
  primeFetchSubscription, checkLastRoutesData, selectDevice, fetchSharedDevice, updateDevices,
} from '.';

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
    if (state.dongleId && !state.routes && !state.primeNav && !state.streamNav) {
      dispatch(checkLastRoutesData());
    }

    const profilePromise = initProfile();
    const devices = await initDevices();
    dispatch(updateDevices(devices));
    state = getState();

    if (devices.length > 0 && !state.dongleId) {
      const allowPathChange = state.router.location.pathname === '/';
      const selectedDongleId = window.localStorage.getItem('selectedDongleId');
      if (selectedDongleId && devices.find((d) => d.dongle_id === selectedDongleId)) {
        dispatch(selectDevice(selectedDongleId, allowPathChange));
      } else {
        dispatch(selectDevice(devices[0].dongle_id, allowPathChange));
      }
    }

    const profile = await profilePromise;
    state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    if (devices.length > 0) {
      const dongleId = getState().dongleId;
      const device = devices.find((dev) => dev.dongle_id === dongleId);
      if (device) {
        dispatch(primeFetchSubscription(dongleId, device, profile));
      } else if (dongleId) {
        dispatch(fetchSharedDevice(dongleId));
      }
    }

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });
  };
}
