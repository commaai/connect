import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA, ACTION_UPDATE_ROUTE_LIMIT, ACTION_SELECT_DEVICE, ACTION_SELECT_TIME_FILTER } from './types';
import { primeFetchSubscription, checkRoutesData, fetchSharedDevice } from '.';
import { navigate } from './navigation';
import { parseLocation, pathForState } from '../url';

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

    dispatch({ type: ACTION_STARTUP_DATA, profile, devices });
    const state = getState();
    // Default to the first device the user sees in the sorted sidebar.
    const orderedDevices = state.devices;
    if (orderedDevices.length > 0) {
      if (!state.dongleId) {
        const selectedDongleId = window.localStorage.getItem('selectedDongleId');
        const device = orderedDevices.find((item) => item.dongle_id === selectedDongleId) || orderedDevices[0];
        dispatch({ type: ACTION_SELECT_DEVICE, dongleId: device.dongle_id });
        // Device selection resets its list. Keep dates named by the current URL,
        // including /demo, which does not need a pathname replacement afterward.
        const filter = parseLocation(getState().router.location).filter;
        if (filter) dispatch({ type: ACTION_SELECT_TIME_FILTER, ...filter });
      }
      const location = getState().router.location;
      const page = parseLocation(location).page;
      if (page === 'home') {
        dispatch(navigate({ ...location, pathname: pathForState({ page: 'device', dongleId: getState().dongleId }) }, true));
      }
    }

    const dongleId = getState().dongleId;
    const device = devices.find((dev) => dev.dongle_id === dongleId);
    if (device) {
      dispatch(primeFetchSubscription(dongleId, device, profile));
    } else if (dongleId) {
      dispatch(fetchSharedDevice(dongleId));
    }

    const current = getState();
    if (['home', 'demo', 'device', 'drive'].includes(parseLocation(current.router.location).page) && current.dongleId) {
      if (!current.limit) dispatch({ type: ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
      dispatch(checkRoutesData());
    }
  };
}
