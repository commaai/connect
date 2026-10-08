import { replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import { api } from '../api/backend';
import { parseUrl, urlFor } from '../url';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, selectDevice, fetchSharedDevice } from '.';

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
    const state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    if (devices.length > 0) {
      if (!state.dongleId) {
        const storedDongleId = window.localStorage.getItem('selectedDongleId');
        const defaultDongleId = devices.some((d) => d.dongle_id === storedDongleId) ? storedDongleId : devices[0].dongle_id;
        if (parseUrl(state.router.location.pathname).page === 'home') {
          dispatch(replace(urlFor({ dongleId: defaultDongleId })));
        } else {
          dispatch(selectDevice(defaultDongleId)); // e.g. /referrals, which has no device in its URL
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

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });
  };
}
