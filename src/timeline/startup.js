import * as API from '../api';
import store from './store';

///@TODO: Break out actions and reducers so code is cleaner
// this is a giant anti-patern in a file
// fix later, but not too later

const ACTION_STARTUP_DATA = 'ACTION_STARTUP_DATA';
const ACTION_SELECT_DEVICE = 'ACTION_SELECT_DEVICE';
const ACTION_SELECT_TIME_RANGE = 'ACTION_SELECT_TIME_RANGE';

export function reducer (state = initialState, action) {
  switch (action.type) {
    case ACTION_STARTUP_DATA:
      if (!state.dongleId) {
        state.dongleId = action.devices[0].dongle_id;
      }
      state.devices = action.devices;
      break;
    case ACTION_SELECT_DEVICE:
      state.dongleId = action.dongleId;
      break;
    case ACTION_SELECT_TIME_RANGE:
      state.start = action.start;
      state.end = action.end;
      state.segmentData = null;
      state.segments = [];
      break;
    default:
      return state;
  }
  return state;
}

export default async function init () {
  console.log('Fetching devices!');
  var devices = await API.listDevices();
  console.log('Device list:', devices);

  store.dispatch({
    type: ACTION_STARTUP_DATA,
    devices
  });
}

export function selectDevice (dongleId) {
  return {
    type: ACTION_SELECT_DEVICE,
    dongleId
  };
}

export function selectTimeRange (start, end) {
  return {
    type: ACTION_SELECT_TIME_RANGE,
    start, end
  };
}

