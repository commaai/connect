// Every page in connect is a URL:
//
//   /                                  landing, opens the last selected device
//   /demo                              landing, with the demo backend
//   /referrals                         referrals
//   /:dongleId                         device dashboard
//   /:dongleId/prime                   comma prime
//   /:dongleId/settings                device settings
//   /:dongleId/stream                  live stream
//   /:dongleId/:logId                  drive
//   /:dongleId/:logId/:start/:end      drive, zoomed to [start, end] in seconds
//   /:dongleId/:start/:end             legacy drive link, as a timestamp range in ms
//
// parseUrl() and urlFor() are the only places that know this layout.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'settings', 'stream'];
const LANDING_PATHS = ['/', '/demo'];

/**
 * @typedef {object} Location
 * @property {string|null} dongleId
 * @property {string|null} logId
 * @property {{start: number, end: number}|null} zoom  drive range in ms
 * @property {string|null} page  'prime' | 'settings' | 'stream' | 'referrals'
 * @property {{start: number, end: number}|null} legacyRange  unix ms
 */

/**
 * @param {string} pathname
 * @returns {Location}
 */
export function parseUrl(pathname) {
  const location = { dongleId: null, logId: null, zoom: null, page: null, legacyRange: null };
  const [first, ...rest] = pathname.split('/').filter(Boolean);

  if (first === 'referrals' && rest.length === 0) {
    return { ...location, page: 'referrals' };
  }
  if (!DONGLE_ID.test(first)) {
    return location;
  }
  location.dongleId = first;

  const [second, start, end] = rest;
  const hasRange = NUMBER.test(start) && NUMBER.test(end);
  if (LOG_ID.test(second)) {
    location.logId = second;
    if (hasRange) {
      location.zoom = { start: Number(start) * 1000, end: Number(end) * 1000 };
    }
  } else if (rest.length === 1 && DEVICE_PAGES.includes(second)) {
    location.page = second;
  } else if (NUMBER.test(second) && NUMBER.test(start)) {
    location.legacyRange = { start: Number(second), end: Number(start) };
  }
  return location;
}

/**
 * The inverse of parseUrl. Zoom is in ms and is widened to whole seconds.
 *
 * @param {Partial<Location>} location
 * @returns {string}
 */
export function urlFor({ dongleId = null, logId = null, zoom = null, page = null }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }

  const parts = [dongleId];
  if (logId) {
    parts.push(logId);
    if (zoom) {
      parts.push(Math.floor(zoom.start / 1000), Math.ceil(zoom.end / 1000));
    }
  } else if (page) {
    parts.push(page);
  }
  return `/${parts.join('/')}`;
}

export function isLandingUrl(pathname) {
  return LANDING_PATHS.includes(pathname.replace(/(.)\/+$/, '$1'));
}
