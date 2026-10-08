import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import {
  primeFetchSubscription, checkLastRoutesData, checkRoutesData, selectDevice, fetchSharedDevice, resolveLegacyRange,
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
    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    let state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });
    state = getState();

    if (devices.length > 0) {
      if (!state.dongleId && state.navigation.page !== 'referrals') {
        const selectedDongleId = window.localStorage.getItem('selectedDongleId');
        if (selectedDongleId && devices.find((d) => d.dongle_id === selectedDongleId)) {
          dispatch(selectDevice(selectedDongleId));
        } else {
          dispatch(selectDevice(devices[0].dongle_id));
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

    state = getState();
    if (state.navigation.page === 'legacy') {
      dispatch(resolveLegacyRange(state.dongleId, state.navigation.range.start, state.navigation.range.end));
    } else if (state.navigation.page === 'drive') {
      dispatch(checkRoutesData());
    } else if (state.dongleId) {
      dispatch(checkLastRoutesData());
    }
  };
}
