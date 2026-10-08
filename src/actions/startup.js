import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, fetchSharedDevice, selectDeviceState } from '.';
import { navigateTo } from './history';

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
    state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });

    if (devices.length > 0 && !state.dongleId) {
      const selectedDongleId = window.localStorage.getItem('selectedDongleId');
      const dongleId = selectedDongleId && devices.find((d) => d.dongle_id === selectedDongleId)
        ? selectedDongleId
        : devices[0].dongle_id;
      if (state.router.location.pathname === '/') {
        dispatch(navigateTo(
          { page: 'dashboard', dongleId },
          { preserveUrlSuffix: true, replace: true },
        ));
      } else {
        dispatch(selectDeviceState(dongleId));
      }
      return;
    }
    const dongleId = getState().dongleId;
    const device = devices.find((candidate) => candidate.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    } else if (dongleId) {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}
