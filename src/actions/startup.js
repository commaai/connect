import * as Sentry from '@sentry/react';
import { replace } from 'connected-react-router';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, fetchSharedDevice } from '.';
import { destinationFromUrl } from '../url';

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
    const destination = destinationFromUrl(state.router.location.pathname);
    if (state.dongleId && !state.routes && destination.kind === 'dashboard') {
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

    if (devices.length > 0) {
      if (!state.dongleId) {
        const allowPathChange = state.router.location.pathname === '/';
        const selectedDongleId = window.localStorage.getItem('selectedDongleId');
        const device = devices.find((d) => d.dongle_id === selectedDongleId) || devices[0];
        if (selectedDongleId && devices.find((d) => d.dongle_id === selectedDongleId)) {
          if (allowPathChange) dispatch(replace(`/${selectedDongleId}`));
        } else {
          if (allowPathChange) dispatch(replace(`/${device.dongle_id}`));
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
