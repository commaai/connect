import * as Sentry from '@sentry/react';
import { replace } from 'connected-react-router';

import { api } from '../api/backend';

import { ACTION_SELECT_DEVICE, ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, fetchSharedDevice } from '.';
import { destinationFromUrl, pathForDestination } from '../url';

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
        const selectedDongleId = window.localStorage.getItem('selectedDongleId');
        const selected = devices.some((d) => d.dongle_id === selectedDongleId) ? selectedDongleId : devices[0].dongle_id;
        const { location } = state.router;
        if (destinationFromUrl(location.pathname).page === 'referrals') {
          dispatch({ type: ACTION_SELECT_DEVICE, dongleId: selected });
        } else {
          dispatch(replace({ ...location, pathname: pathForDestination({ dongleId: selected }) }));
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
