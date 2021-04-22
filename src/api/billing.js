import ConfigRequest from 'config-request/instance';
import errorHandler from '@commaai/comma-api/src/errorHandler';
import qs from 'querystringify';

let COMMA_BILLING_ROOT;
if (__DEV__) {
  COMMA_BILLING_ROOT = 'http://192.168.1.101:5000/';
} else {
  COMMA_BILLING_ROOT = 'https://billing.comma.ai/';
}

const request = ConfigRequest();

function ensureInit() {
  if (!request.config.token) {
    throw new Error('Must call configure with an access token before using API');
  }
}

export async function configure(accessToken) {
  const config = {
    baseUrl: COMMA_BILLING_ROOT,
    jwt: false,
    parse: null,
  };

  if (accessToken) {
    config.token = `JWT ${accessToken}`;
  }

  request.configure(config);
}

export function getSubscription(dongleId) {
  return get('v1/prime/subscription?' + qs.stringify({dongle_id: dongleId}))
}

export function payForPrime(dongleId, simId, stripeToken) {
  return post('v1/prime/pay', { dongle_id: dongleId, sim_id: simId, stripe_token: stripeToken });
}

export function getPaymentMethod() {
  return get('v1/prime/payment_source');
}

export function updatePaymentMethod(stripe_token) {
  return post('v1/prime/payment_source', { stripe_token });
}

export function cancelPrime(dongleId) {
  return post('v1/prime/cancel', { dongle_id: dongleId });
}

export async function get(endpoint, data) {
  ensureInit();

  return new Promise((resolve, reject) => {
    request.get(
      endpoint,
      {
        query: data,
        json: true
      },
      errorHandler(resolve, reject)
    );
  });
}

export async function post(endpoint, data) {
  ensureInit();

  return new Promise((resolve, reject) => {
    request.post(
      endpoint,
      {
        body: data,
        json: true
      },
      errorHandler(resolve, reject)
    );
  });
}
