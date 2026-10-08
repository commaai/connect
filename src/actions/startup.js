import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, selectDevice, fetchSharedDevice } from '.';
import { applyUrl } from './history';

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
    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    if (devices.length > 0) {
      if (!getState().dongleId) {
        // the url has no device, use the one used last
        const lastDongleId = window.localStorage.getItem('selectedDongleId');
        const lastDevice = devices.find((d) => d.dongle_id === lastDongleId) || devices[0];
        dispatch(selectDevice(lastDevice.dongle_id));
      }
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

    dispatch(applyUrl());
  };
}
