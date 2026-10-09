import * as Sentry from '@sentry/react';

import { api } from '../api/backend';

import { ACTION_STARTUP_DATA } from './types';
import { syncStateFromURL } from './history';

const loadStartupData = async () => {
  const { auth, account, devices } = api;
  if (!auth.isAuthenticated()) return [null, []];
  return Promise.all([
    account.getProfile().catch(async (err) => {
      if (err?.resp?.status === 401) await auth.logOut();
      else Sentry.captureException(err, { fingerprint: 'init_api_get_profile' });
      return null;
    }),
    devices.listDevices().catch((err) => {
      if (err?.resp?.status !== 401) Sentry.captureException(err, { fingerprint: 'init_api_list_devices' });
      return [];
    }),
  ]);
}

export default function init() {
  return async (dispatch, getState) => {
    const [profile, devices] = await loadStartupData();
    if (profile) Sentry.setUser({ id: profile.id });

    dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
    });

    dispatch(syncStateFromURL(getState().router.location.pathname, devices[0]?.dongle_id));
  }
}
