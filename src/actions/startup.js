import { replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import { api } from '../api/backend';
import { buildUrl } from '../url';

import { ACTION_STARTUP_DATA } from './types';
import { loadDevice } from '.';

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

    // a url without a device shows the last used one, or the first
    const fromUrl = getState().dongleId;
    const remembered = window.localStorage.getItem('selectedDongleId');
    const fallback = devices.find((d) => d.dongle_id === remembered) || devices[0];
    const dongleId = fromUrl || fallback?.dongle_id || null;

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
      dongleId,
    });

    if (profile && dongleId) {
      dispatch(loadDevice(dongleId));
    }
    if (fallback && !fromUrl) {
      window.localStorage.setItem('selectedDongleId', dongleId);
      if (getState().page === 'dashboard') {
        dispatch(replace(buildUrl({ page: 'dashboard', dongleId })));
      }
    }
  };
}
