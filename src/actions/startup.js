import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { navigate } from '.';
import { syncLocation } from './history';

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
    if (profile) Sentry.setUser({ id: profile.id });
    const selected = window.localStorage.getItem('selectedDongleId');
    const defaultDongleId = devices.find((device) => device.dongle_id === selected)?.dongle_id
      || devices[0]?.dongle_id || null;
    dispatch({ type: ACTION_STARTUP_DATA, profile, devices, defaultDongleId });
    const { navigation } = getState();
    if (['home', 'demo'].includes(navigation.page) && defaultDongleId) {
      dispatch(navigate({ ...navigation, page: 'device', dongleId: defaultDongleId }, true));
      window.localStorage.setItem('selectedDongleId', defaultDongleId);
    }
    dispatch(syncLocation(getState().router.location, true));
  };
}
