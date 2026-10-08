import * as Sentry from '@sentry/react';

import { replace } from 'connected-react-router';

import { api } from '../api/backend';
import { Page, parseUrl, deviceUrl } from '../url';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, fetchSharedDevice } from '.';
import { homeDongleId } from './history';

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

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });

    if (devices.length === 0) {
      return;
    }

    const { dongleId, router } = getState();
    const device = devices.find((dev) => dev.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    } else if (dongleId) {
      dispatch(fetchSharedDevice(dongleId));
    }

    // `/` needs the device list to pick a device
    if (parseUrl(router.location.pathname).page === Page.HOME) {
      dispatch(replace(deviceUrl(homeDongleId(devices))));
    }
  };
}
