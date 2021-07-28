import * as Sentry from '@sentry/react';
import { devices as Devices, account as Account, billing as Billing } from '@commaai/comma-api';

import store from './store';
import { ACTION_STARTUP_DATA } from './actions/types';
import { primeGetPaymentMethodAction, primeGetSubscriptionAction } from './actions';
import { getDongleID, getPrimeNav } from '../url';

const demoProfile = require('../demo/profile.json');
const demoDevices = require('../demo/devices.json');

export default async function init(isDemo) {
  if (isDemo) {
    store.dispatch({
      type: ACTION_STARTUP_DATA,
      profile: demoProfile,
      devices: demoDevices,
    });
  } else {
    console.log('Fetching devices!');
    let devices = Devices.listDevices();
    let profile = Account.getProfile();
    devices = await devices;
    profile = await profile;
    console.log('Device list:', devices);

    if (devices.length > 0) {
      const dongleId = getDongleID(window.location.pathname) || devices[0].dongle_id;
      const device = devices.find((dev) => dev.dongle_id === dongleId);
      if (device && (device.is_owner || profile.superuser)) {
        Billing.getSubscription(dongleId).then((subscription) => {
          store.dispatch(primeGetSubscriptionAction(dongleId, subscription));
        }).catch((err) => {
          if (!err.message || err.message.indexOf('404') !== 0) {
            console.log(err);
            Sentry.captureException(err);
          }
        });
      }
    }

    store.dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices,
      primeNav: getPrimeNav(window.location.pathname),
    });

    if (profile.prime) {
      Billing.getPaymentMethod().then((paymentMethod) => {
        store.dispatch(primeGetPaymentMethodAction(paymentMethod));
      }).catch((err) => {
        if (!err.resp || err.resp.status !== 400) {
          console.log(err.message);
          Sentry.captureException(err);
        }
      });
    }
  }
}
