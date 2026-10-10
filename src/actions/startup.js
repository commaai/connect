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

let accountRequest = null;

// Load the profile and devices once. Everything that needs them waits on the same request.
export function loadAccount() {
  return async (dispatch, getState) => {
    if (getState().devices !== null) {
      const { profile, devices } = getState();
      return { profile, devices };
    }

    if (!accountRequest) {
      accountRequest = Promise.all([initProfile(), initDevices()]).finally(() => {
        accountRequest = null;
      });
    }
    const [profile, devices] = await accountRequest;
    if (getState().devices === null) {
      if (profile) {
        Sentry.setUser({ id: profile.id });
      }
      dispatch({ type: ACTION_STARTUP_DATA, profile, devices });
    }
    return { profile, devices };
  };
}
