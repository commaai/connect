import * as API from '../api';
import store from './store';
import { ACTION_STARTUP_DATA } from './actions/types';

export default async function init () {
  console.log('Fetching devices!');
  var devices = API.listDevices();
  var profile = API.getProfile();
  devices = await devices;
  profile = await profile;
  console.log('Device list:', devices);

  store.dispatch({
    type: ACTION_STARTUP_DATA,
    profile,
    devices
  });
}
