import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';

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
    if (getState().devices) {
      return;
    }
    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    const remembered = window.localStorage.getItem('selectedDongleId');
    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
      dongleId: (devices.find((d) => d.dongle_id === remembered) || devices[0])?.dongle_id || null,
    });
  };
}
