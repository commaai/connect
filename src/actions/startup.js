import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkRoutesData, selectDevice, fetchSharedDevice, applyUrl } from '.';

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
      dispatch(checkRoutesData());
    }

    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });

    if (devices.length > 0) {
      state = getState();
      if (!state.dongleId) {
        const selectedDongleId = window.localStorage.getItem('selectedDongleId');
        const selectedDevice = devices.find((d) => d.dongle_id === selectedDongleId) || devices[0];
        if (state.router.location.pathname === '/') {
          dispatch(selectDevice(selectedDevice.dongle_id));
        } else if (state.router.location.pathname === '/referrals') {
          dispatch(applyUrl(state.router.location, selectedDevice.dongle_id));
        }
      }
      const dongleId = getState().dongleId;
      const device = devices.find((dev) => dev.dongle_id === dongleId);
      if (device) {
        dispatch(primeFetchSubscription(dongleId, device, profile));
      } else if (dongleId) {
        dispatch(fetchSharedDevice(dongleId));
      }
    }

  };
}
