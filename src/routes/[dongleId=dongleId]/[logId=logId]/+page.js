import * as Sentry from '@sentry/browser';

import { devices as Devices } from '$lib/api';
import { fetchRoutes, getPagedFilter } from '$lib/state/route-list';

export async function load({ params, parent }) {
  const { dongleId, logId } = params;
  const { devices, profile } = await parent();
  const fullname = `${dongleId}|${logId}`;

  const [device, routes] = await Promise.all([
    devices?.find((d) => d.dongle_id === dongleId)
      ?? Devices.fetchDevice(dongleId).catch((err) => {
        Sentry.captureException(err, { fingerprint: 'drive_fetch_device' });
        return null;
      }),
    // checkRoutesData asked for the one route by name when a segment range was
    // in the URL, rather than the whole window.
    fetchRoutes(dongleId, getPagedFilter(), 0, fullname).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'drive_fetch_route' });
      return null;
    }),
  ]);

  return {
    dongleId,
    logId,
    device,
    profile,
    routes,
    route: routes?.find((r) => r.fullname === fullname) ?? routes?.[0] ?? null,
  };
}
