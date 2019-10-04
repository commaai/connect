import {
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_UPDATE_DEVICE,
} from './types';

export function updateDevice(device) {
  return {
    type: ACTION_UPDATE_DEVICE,
    device,
  };
}

export function selectDevice(dongleId) {
  return {
    type: ACTION_SELECT_DEVICE,
    dongleId
  };
}

export function selectTimeRange(start, end) {
  return {
    type: ACTION_SELECT_TIME_RANGE,
    start,
    end
  };
}
