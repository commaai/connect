import * as Sentry from '@sentry/browser';

import { devices as Devices } from '$lib/api';
import { fetchRoutes, getPagedFilter } from '$lib/state/route-list';

/**
 * Load one drive. Shared by `/{dongleId}/{logId}` and the zoomed
 * `/{dongleId}/{logId}/{start}/{end}` form, which differ only in the zoom.
 */
export async function loadDrive({ params, parent }) {
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

/**
 * The zoom carried by a `/{dongleId}/{logId}/{start}/{end}` path.
 *
 * urlForState wrote the range as whole seconds of route-relative offset, and
 * url.js getSegmentRange multiplied them back up; the reducer then took that
 * range as the zoom verbatim. Out-of-range values are clamped here, which the
 * reducer did not do — a hand-typed range used to leave the timeline unusable.
 *
 * @returns {{start: number, end: number, previous: null}|null} null when the
 *   range is unusable, meaning "show the whole route".
 */
export function zoomFromParams(params, route) {
  const start = Number(params.start) * 1000;
  const end = Number(params.end) * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const duration = route?.duration;
  const upper = Number.isFinite(duration) ? Math.min(end, duration) : end;
  const lower = Math.max(0, Math.min(start, upper));
  if (upper <= lower) return null;

  return { start: lower, end: upper, previous: null };
}
