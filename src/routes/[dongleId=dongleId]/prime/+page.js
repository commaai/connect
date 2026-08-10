import * as Sentry from '@sentry/browser';

import { billing as Billing, devices as Devices } from '$lib/api';

/**
 * Billing is only read for a device the account owns, or for any device when the
 * profile is a superuser. A prime device reads its subscription, a non-prime one
 * reads subscribe_info. Either request failing leaves the screen with null.
 */
export async function load({ params, parent }) {
  const { dongleId } = params;
  const { devices, profile } = await parent();

  // The account's own list already has it; a shared device has to be fetched.
  const device = devices?.find((d) => d.dongle_id === dongleId)
    ?? await Devices.fetchDevice(dongleId).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'prime_fetch_device' });
      return null;
    });

  if (!device || (!device.is_owner && !profile?.superuser)) {
    return { dongleId, device, subscription: null, subscribeInfo: null };
  }

  if (device.prime) {
    const subscription = await Billing.getSubscription(dongleId).catch((err) => {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
      return null;
    });
    return { dongleId, device, subscription, subscribeInfo: null };
  }

  const subscribeInfo = await Billing.getSubscribeInfo(dongleId).catch((err) => {
    console.error(err);
    Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
    return null;
  });
  return { dongleId, device, subscription: null, subscribeInfo };
}
