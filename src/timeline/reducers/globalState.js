import {
  ACTION_PROFILE_REFRESHED,
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_STARTUP_DATA,
  ACTION_UPDATE_DEVICE,
} from '../actions/types';

export default function reducer (state = initialState, action) {
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
    case ACTION_PROFILE_REFRESHED:
      state.profile = action.profile;
      break;
    case ACTION_UPDATE_DEVICE:
      let deviceIndex = state.devices.findIndex(d => d.dongle_id === action.device.dongle_id);
      state.devices[deviceIndex] = action.device;
      break;
    default:
      return state;
  }
  return state;
}
