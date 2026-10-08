import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, fetchSharedDevice } from '.';
import { navigate } from './navigation';

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

function defaultDongleId(devices) {
  const stored = window.localStorage.getItem('selectedDongleId');
  return devices.some((d) => d.dongle_id === stored) ? stored : devices[0]?.dongle_id;
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
      dongleId: defaultDongleId(devices),
    });

    const { dongleId, nav } = getState();
    if (nav.page === 'home' && dongleId) {
      dispatch(navigate({ page: 'dashboard', dongleId, modal: nav.modal }, { replace: true }));
    }

    const device = devices.find((dev) => dev.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    } else if (dongleId) {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}
