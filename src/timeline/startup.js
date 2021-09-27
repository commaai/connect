import * as Sentry from '@sentry/react';
import { devices as Devices, account as Account, billing as Billing } from '@commaai/comma-api';

import * as Demo from '../demo';
import store from './store';
import { ACTION_STARTUP_DATA } from './actions/types';
import { primeGetSubscriptionAction, primeGetSubscribeInfoAction } from './actions';
import { getDongleID, getPrimeNav } from '../url';
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

export default async function init() {
  const [profile, devices] = await Promise.all([initProfile(), initDevices()]);

  if (profile) {
    Sentry.setUser({ id: profile.id });
  }

  if (devices.length > 0) {
    const dongleId = getDongleID(window.location.pathname) || devices[0].dongle_id;
    const device = devices.find((dev) => dev.dongle_id === dongleId);
    if (device && (device.is_owner || profile.superuser)) {
      if (device.prime) {
        Billing.getSubscription(dongleId).then((subscription) => {
          store.dispatch(primeGetSubscriptionAction(dongleId, subscription));
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'init_get_subscription' });
        });
      } else {
        Billing.getSubscribeInfo(dongleId).then((subscribeInfo) => {
          store.dispatch(primeGetSubscribeInfoAction(dongleId, subscribeInfo));
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'init_get_subscribe_info' });
        });
      }
    }
  }

  store.dispatch({
    type: ACTION_STARTUP_DATA,
    profile,
    devices,
    primeNav: getPrimeNav(window.location.pathname),
  });
}
