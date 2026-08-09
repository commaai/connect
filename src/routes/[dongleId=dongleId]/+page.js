import * as Sentry from '@sentry/browser';

import { devices as Devices } from '$lib/api';
import { fetchRoutes, getDefaultFilter } from '$lib/state/route-list';

export async function load({ params, parent }) {
  const { dongleId } = params;
  const { devices } = await parent();
  const filter = getDefaultFilter();

  const [device, routes] = await Promise.all([
    // The account's own list already has it; a shared device has to be fetched.
    devices?.find((d) => d.dongle_id === dongleId)
      ?? Devices.fetchDevice(dongleId).catch((err) => {
        Sentry.captureException(err, { fingerprint: 'dashboard_fetch_device' });
        return null;
      }),
    fetchRoutes(dongleId, filter).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'dashboard_fetch_routes' });
      return null;
    }),
  ]);

  return { dongleId, device, routes, filter };
}
