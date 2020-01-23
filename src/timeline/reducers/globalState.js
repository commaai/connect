import {
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_STARTUP_DATA,
  ACTION_UPDATE_DEVICE,
} from '../actions/types';

const initialState = {};

export default function reducer(_state = initialState, action) {
  let state = _state;
  let deviceIndex = null;
  switch (action.type) {
    case ACTION_STARTUP_DATA:
      if (!state.dongleId && action.devices.length > 0) {
        state = {
          ...state,
          dongleId: action.devices[0].dongle_id,
          device: action.devices[0]
        };
      } else {
        state = {
          ...state,
          device: action.devices.find((device) => device.dongle_id === state.dongleId)
        };
        if (!state.device) {
          state.device = {
            alias: null,
            create_time: 1513041169,
            device_type: 'unknown',
            dongle_id: '0000000000000000',
            imei: '000000000000000',
            is_owner: false,
            serial: '00000000'
          };
        }
      }
      state.devices = action.devices;
      state.profile = action.profile;
      break;
    case ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId
      };
      if (state.devices) {
        state.device = state.devices.find((device) => device.dongle_id === action.dongleId);
      }
      if (state.segmentData && state.segmentData.dongleId !== state.dongleId) {
        state.segmentData = null;
        state.segments = [];
      }
      break;
    case ACTION_SELECT_TIME_RANGE:
      state.start = action.start;
      state.end = action.end;
      state.segmentData = null;
      state.segments = [];
      break;
    case ACTION_UPDATE_DEVICE:
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.device.dongle_id);
      state.devices[deviceIndex] = action.device;
      state.device = action.device;
      break;
    default:
      return state;
  }
  return state;
}
