import {
  ACTION_PRIME_NAV,
  ACTION_PRIME_PAYMENTMETHOD,
  ACTION_PRIME_SUBSCRIPTION,
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
