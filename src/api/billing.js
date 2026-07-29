import Config from './config';
import ConfigRequest from './instance';

const request = new ConfigRequest(Config.BILLING_URL_ROOT);

export function configure(accessToken, errorResponseCallback = null) {
  request.configure(accessToken, errorResponseCallback);
}

export function getSubscription(dongleId) {
  return request.get('v1/prime/subscription', { dongle_id: dongleId });
}

export function getSubscribeInfo(dongleId) {
  return request.get('v1/prime/subscribe_info', { dongle_id: dongleId });
}

export function cancelPrime(dongleId) {
  return request.post('v1/prime/cancel', { dongle_id: dongleId });
}

export function getStripeCheckout(dongleId, simId, plan) {
  return request.post('v1/prime/stripe_checkout', {
    dongle_id: dongleId,
    sim_id: simId,
    plan,
  });
}

export function getStripePortal(dongleId) {
  return request.get('v1/prime/stripe_portal', { dongle_id: dongleId });
}

export function getStripeSession(dongleId, sessionId) {
  return request.get('v1/prime/stripe_session', {
    dongle_id: dongleId,
    session_id: sessionId,
  });
}

export async function switchPrimePlan(dongle_id, plan, sim_id = null) {
  return request.post('v1/prime/switch_plan', { dongle_id, plan, sim_id });
}
