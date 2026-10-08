import { replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { primeFetchSubscription, checkLastRoutesData, selectDevice, fetchSharedDevice } from '.';
import { parseLocation, urlForLocation } from '../url';

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
    const initial = getState();
    if (initial.dongleId && !initial.routes) dispatch(checkLastRoutesData());

    const [profile, devices] = await Promise.all([initProfile(), initDevices()]);
    if (profile) Sentry.setUser({ id: profile.id });
    dispatch({ type: ACTION_STARTUP_DATA, profile, devices });

    const state = getState();
    const navigation = state.navigation || parseLocation(state.router.location);
    if (['not-found', 'auth'].includes(navigation.page)) return;
    if (!state.dongleId && devices.length > 0 && ['home', 'referrals'].includes(navigation.page)) {
      const remembered = window.localStorage.getItem('selectedDongleId');
      const selected = devices.find((device) => device.dongle_id === remembered) || devices[0];
      if (navigation.page === 'home') {
        // Initial preference resolution replaces the placeholder root entry.
        dispatch(replace(urlForLocation({ ...navigation, page: 'device', dongleId: selected.dongle_id })));
      } else {
        dispatch(selectDevice(selected.dongle_id, false, false));
      }
    }
    const current = getState();
    const device = devices.find((entry) => entry.dongle_id === current.dongleId);
    if (current.dongleId) {
      window.localStorage.setItem('selectedDongleId', current.dongleId);
      if (device) dispatch(primeFetchSubscription(current.dongleId, device, profile));
      else dispatch(fetchSharedDevice(current.dongleId));
      if (!current.routes) dispatch(checkLastRoutesData());
    }
  };
}
