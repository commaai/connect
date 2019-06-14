import { listDevices } from 'comma-api/src/devices';
import { getProfile } from 'comma-api/src/account';

import store from './store';
import { ACTION_STARTUP_DATA } from './actions/types';

export default async function init () {
  console.log('Fetching devices!');
  var devices = listDevices();
  var profile = getProfile();
  devices = await devices;
  profile = await profile;
  console.log('Device list:', devices);

  store.dispatch({
    type: ACTION_STARTUP_DATA,
    profile,
    devices
  });
}
