import { billing as ApiBilling } from '@commaai/api';
import Config from '@commaai/api/src/config';
import ConfigRequest from '@commaai/api/src/instance';

const request = new ConfigRequest(Config.BILLING_URL_ROOT);

export function configure(accessToken, errorResponseCallback = null) {
  ApiBilling.configure(accessToken, errorResponseCallback);
  request.configure(accessToken, errorResponseCallback);
}

export const getSubscription = ApiBilling.getSubscription;
export const getSubscribeInfo = ApiBilling.getSubscribeInfo;
export const cancelPrime = ApiBilling.cancelPrime;
export const getStripeCheckout = ApiBilling.getStripeCheckout;
export const getStripePortal = ApiBilling.getStripePortal;
export const getStripeSession = ApiBilling.getStripeSession;

export async function switchPrimePlan(dongle_id, plan, sim_id = null) {
  return request.post('v1/prime/switch_plan', { dongle_id, plan, sim_id });
}
