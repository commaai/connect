import * as Sentry from '@sentry/react';
import { replace } from 'connected-react-router';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, selectDevice, fetchSharedDevice } from '.';

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

    if (devices.length > 0) {
      if (!state.dongleId) {
        let selectedDongleId = window.localStorage.getItem('selectedDongleId');
        if (!devices.some((d) => d.dongle_id === selectedDongleId)) {
          selectedDongleId = devices[0].dongle_id;
          window.localStorage.setItem('selectedDongleId', selectedDongleId);
        }
        const { pathname, search } = state.router.location;
        if (['/demo', '/referrals'].includes(pathname)) {
          dispatch(selectDevice(selectedDongleId)); // pages without a device in their url
        } else {
          dispatch(replace(`/${selectedDongleId}${search}`)); // '/', or a url that is not a page
        }
      }
    }

    const dongleId = getState().dongleId;
    const device = devices.find((dev) => dev.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    } else if (dongleId && api.auth.isAuthenticated()) {
      dispatch(fetchSharedDevice(dongleId)); // shared with the user, also when they have no devices
    }

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });
  };
}
