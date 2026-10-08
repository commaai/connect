// Every URL connect understands:
//
//   /                               home, opens the last selected device
//   /referrals                      referral program
//   /:dongleId                      device dashboard
//   /:dongleId/prime                comma prime
//   /:dongleId/settings             device settings
//   /:dongleId/stream               live stream
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   part of a drive, in seconds
//   /:dongleId/:start/:end          legacy range in unix milliseconds, replaced by its drive's URL
//
// parseUrl() reads a pathname into a location and urlFor() writes one back.
// actions/history.js applies locations to the app state.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'settings', 'stream'];

function range(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

/**
 * @typedef {object} Location
 * @property {string} page home, referrals, dashboard, prime, settings, stream, drive or legacy
 * @property {string|null} dongleId
 * @property {string|null} logId the open drive
 * @property {{ start: number, end: number }|null} zoom selected part of the drive, or the legacy range, in ms
 */

/** @returns {Location} */
export function parseUrl(pathname) {
  const [first, ...rest] = pathname.split('/').filter(Boolean);
  const location = { page: 'home', dongleId: null, logId: null, zoom: null };

  if (first === 'referrals' && rest.length === 0) {
    return { ...location, page: 'referrals' };
  }
  if (!DONGLE_ID.test(first)) {
    return location;
  }

  location.dongleId = first;
  if (rest.length === 1 && DEVICE_PAGES.includes(rest[0])) {
    return { ...location, page: rest[0] };
  }
  if (LOG_ID.test(rest[0])) {
    return { ...location, page: 'drive', logId: rest[0], zoom: range(rest[1], rest[2], 1000) };
  }
  const legacyRange = range(rest[0], rest[1], 1);
  if (legacyRange) {
    return { ...location, page: 'legacy', zoom: legacyRange };
  }
  return { ...location, page: 'dashboard' };
}

/** @param {Partial<Location>} location */
export function urlFor({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (logId) {
    // round outwards so a short selection keeps a non-empty range
    return zoom
      ? `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`
      : `/${dongleId}/${logId}`;
  }
  return DEVICE_PAGES.includes(page) ? `/${dongleId}/${page}` : `/${dongleId}`;
}
