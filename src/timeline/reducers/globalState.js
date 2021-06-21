import {
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_STARTUP_DATA,
  ACTION_UPDATE_DEVICE,
  ACTION_PRIME_NAV,
  ACTION_PRIME_SUBSCRIPTION,
  ACTION_PRIME_PAYMENTMETHOD,
} from '../actions/types';

const initialState = {};

export default function reducer(_state = initialState, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case ACTION_STARTUP_DATA:
      let devices = action.devices.map((device) => {
        return {
          ...device,
          fetched_at: parseInt(Date.now() / 1000),
        };
      });
      if (!state.dongleId && devices.length > 0) {
        state = {
          ...state,
          dongleId: devices[0].dongle_id,
          device: devices[0]
        };
      } else {
        state = {
          ...state,
          device: devices.find((device) => device.dongle_id === state.dongleId)
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
      state.devices = devices;
      state.profile = action.profile;
      break;
    case ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId,
        primeNav: false,
        subscription: null,
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
      state = {
        ...state,
        start: action.start,
        end: action.end,
        segmentData: null,
        segments: [],
      };
      break;
    case ACTION_UPDATE_DEVICE:
      state = {
        ...state,
        devices: [...state.devices],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.device.dongle_id);
      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = action.device;
      } else {
        state.devices.push(action.device);
      }
      break;
    case ACTION_PRIME_NAV:
      state = {
        ...state,
        primeNav: action.primeNav,
      };
      break;
    case ACTION_PRIME_SUBSCRIPTION:
      if (action.dongleId != state.dongleId) { // ignore outdated info
        break;
      }
      state = {
        ...state,
        subscription: action.subscription,
      };
      break;
    case ACTION_PRIME_PAYMENTMETHOD:
      state = {
        ...state,
        paymentMethod: action.paymentMethod,
      };
      break;
    default:
      return state;
  }
  return state;
}
