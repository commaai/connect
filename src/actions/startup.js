import * as Sentry from '@sentry/react';
import { devices as Devices, account as Account } from '@commaai/comma-api';

import * as Demo from '../demo';
import { ACTION_STARTUP_DATA } from '../actions/types';
import { primeFetchSubscription, checkRoutesData, selectDevice, fetchSharedDevice } from '../actions';
import MyCommaAuth from '@commaai/my-comma-auth';

const demoProfile = require('../demo/profile.json');
const demoDevices = require('../demo/devices.json');

async function initProfile() {
  if (MyCommaAuth.isAuthenticated()) {
    try {
      return await Account.getProfile();
    } catch (err) {
      if (err.resp && err.resp.status === 401) {
        await MyCommaAuth.logOut();
      } else {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
      }
    }
  } else if (Demo.isDemo()) {
    return demoProfile;
  }
}

async function initDevices() {
  let devices = [];

  if (Demo.isDemo()) {
    devices = devices.concat(demoDevices);
  }

  if (MyCommaAuth.isAuthenticated()) {
    try {
      devices = devices.concat(await Devices.listDevices());
    } catch (err) {
      if (!err.resp || err.resp.status !== 401) {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
      }
    }
  }

  return devices;
}

export default function init() {
  return async (dispatch, getState) => {
    let state = getState();
    if (state.dongleId) {
      dispatch(checkRoutesData());
    }

    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    state = getState();

    if (profile) {
      Sentry.setUser({ id: profile.id });
    }

    if (devices.length > 0) {
      if (!state.dongleId) {
        dispatch(selectDevice(devices[0].dongle_id));
      }
      const dongleId = state.dongleId || devices[0].dongle_id || null;
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
