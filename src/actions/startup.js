import * as Sentry from '@sentry/react';
import { account as Account, devices as Devices } from '@commaai/api';
import MyCommaAuth from '@commaai/my-comma-auth';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, selectDevice, fetchSharedDevice } from '.';

async function initProfile() {
  if (MyCommaAuth.isAuthenticated()) {
    try {
      return await Account.getProfile();
    } catch (err) {
      if (err.resp && err.resp.status === 401) {
        await MyCommaAuth.logOut();
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

  if (MyCommaAuth.isAuthenticated()) {
    try {
      devices = devices.concat(await Devices.listDevices());
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
    if (getState().dongleId && !getState().routes) {
      dispatch(checkLastRoutesData());
    }

    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    if (profile) Sentry.setUser({ id: profile.id });

    dispatch({ type: ACTION_STARTUP_DATA, profile, devices });

    if (devices.length === 0) return;

    let dongleId = getState().dongleId;
    if (!dongleId) {
      const saved = window.localStorage.getItem('selectedDongleId');
      dongleId = devices.some((d) => d.dongle_id === saved) ? saved : devices[0].dongle_id;
      dispatch(selectDevice(dongleId));
    } else if (devices.some((d) => d.dongle_id === dongleId)) {
      dispatch(primeFetchSubscription(dongleId));
    } else {
      dispatch(fetchSharedDevice(dongleId));
    }
  };
}
