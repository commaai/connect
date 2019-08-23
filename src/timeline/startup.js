import { devices as Devices, account as Account } from '@commaai/comma-api';

import store from './store';
import { ACTION_STARTUP_DATA } from './actions/types';
const demoProfile = require('../demo/profile.json');
const demoDevices = require('../demo/devices.json');

export default async function init (isDemo) {
  if (isDemo) {
    store.dispatch({
      type: ACTION_STARTUP_DATA,
      profile: demoProfile,
      devices: demoDevices,
    });
  } else {
    console.log('Fetching devices!');
    var devices = Devices.listDevices();
    var profile = Account.getProfile();
    devices = await devices;
    profile = await profile;
    console.log('Device list:', devices);

    store.dispatch({
      type: ACTION_STARTUP_DATA,
      profile,
      devices
    });
  }
}
