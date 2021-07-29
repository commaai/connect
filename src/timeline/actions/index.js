import {
  ACTION_PRIME_NAV,
  ACTION_PRIME_PAYMENTMETHOD,
  ACTION_PRIME_SUBSCRIPTION,
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_UPDATE_DEVICES,
  ACTION_UPDATE_DEVICE,
  ACTION_UPDATE_DEVICE_ONLINE,
} from './types';

export function updateDevices(devices) {
  return {
    type: ACTION_UPDATE_DEVICES,
    devices,
  };
}

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

export function primeGetSubscriptionAction(dongleId, subscription) {
  return {
    type: ACTION_PRIME_SUBSCRIPTION,
    dongleId,
    subscription,
  };
}

export function primeGetPaymentMethodAction(paymentMethod) {
  return {
    type: ACTION_PRIME_PAYMENTMETHOD,
    paymentMethod,
  };
}

export function primeNavAction(nav) {
  return {
    type: ACTION_PRIME_NAV,
    primeNav: nav,
  };
}

export function updateDeviceOnlineAction(dongleId, last_athena_ping, fetched_at) {
  return {
    type: ACTION_UPDATE_DEVICE_ONLINE,
    dongleId,
    last_athena_ping,
    fetched_at,
  };
}
