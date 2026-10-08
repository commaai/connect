import * as Sentry from '@sentry/react';

import { api } from '../api/backend';
import { fallbackServices } from '../routing/services';

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

// Load the profile and device list once per store. Independent of the URL:
// navigation effects that need the device list wait on the returned promise.
export function bootstrapSession() {
  return (dispatch, getState, services = fallbackServices) => {
    if (!services.session.promise) {
      services.session.promise = Promise.all([initProfile(), initDevices()]).then(([profile, devices]) => {
        if (profile) {
          Sentry.setUser({ id: profile.id });
        }
        dispatch({ type: ACTION_STARTUP_DATA, profile, devices });
        return { profile, devices };
      });
    }
    return services.session.promise;
  };
}
