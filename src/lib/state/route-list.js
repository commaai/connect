import { drives as Drives } from '$lib/api';

const DAY_MS = 24 * 60 * 60 * 1000;

export const FIVE_YEARS = 5 * 365 * DAY_MS;
export const LIMIT_INCREMENT = 5;

/** The drive list's default window: the last two weeks, rounded up to the hour. */
export function getDefaultFilter() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return {
    start: d.getTime() - (14 * DAY_MS),
    end: d.getTime(),
  };
}

/**
 * The window the drive list actually settles on.
 *
 * checkLastRoutesData widened the range to five years and raised the limit as
 * soon as the dashboard mounted, so the two-week default above was only ever
 * live for one render. Paging is by `limit`, not by moving this window.
 */
export function getPagedFilter() {
  const end = Date.now();
  return { start: end - FIVE_YEARS, end };
}

/**
 * Normalise a routes_segments response, ported from the map in
 * src/actions/index.js. The API's route-level timestamps disagree with the
 * segment boundaries on some routes, so the segment times win unless they look
 * like the known bad case.
 *
 * @param {Array} routesData
 * @returns {Array}
 */
export function normalizeRoutes(routesData) {
  if (!routesData) return null;

  return routesData.map((r) => {
    let startTime = r.segment_start_times[0];
    let endTime = r.segment_end_times[r.segment_end_times.length - 1];

    // TODO: these will all be relative times soon
    // fix segment boundary times for routes that have the wrong time at the start
    if ((Math.abs(r.start_time_utc_millis - startTime) > DAY_MS)
        && (Math.abs(r.end_time_utc_millis - endTime) < 10 * 1000)) {
      startTime = r.start_time_utc_millis;
      endTime = r.end_time_utc_millis;
      r.segment_start_times = r.segment_numbers.map((x) => startTime + (x * 60 * 1000));
      r.segment_end_times = r.segment_numbers.map((x) => Math.min(startTime + ((x + 1) * 60 * 1000), endTime));
    }

    // TODO: backwards compatibility, remove later
    if (r.distance == null && r.length != null) {
      r.distance = r.length;
    }

    return {
      ...r,
      url: r.url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate.azureedge.net'),
      log_id: r.fullname.split('|')[1],
      duration: endTime - startTime,
      start_time_utc_millis: startTime,
      end_time_utc_millis: endTime,
      // TODO: get this from the API, this isn't correct for segments with a time jump
      segment_durations: r.segment_start_times.map((x, i) => r.segment_end_times[i] - x),
    };
  }).sort((a, b) => b.create_time - a.create_time);
}

/**
 * @param {string} dongleId
 * @param {{start: number, end: number}} filter
 * @param {number} limit 0 for the API default
 * @param {string} [routeStr] fetch one route by `dongleId|logId` instead of a range
 */
export async function fetchRoutes(dongleId, filter, limit = 0, routeStr = undefined) {
  const routesData = routeStr
    ? await Drives.getRoutesSegments(dongleId, undefined, undefined, undefined, routeStr)
    : await Drives.getRoutesSegments(dongleId, filter.start, filter.end, limit);

  return normalizeRoutes(routesData);
}
