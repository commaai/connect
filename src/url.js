// The URL is the source of truth for which page is shown. `parseUrl` turns a
// pathname into a plain description of that page and `buildUrl` turns one back
// into a pathname. Nothing else in the app should split or join paths.
//
//   /                              root, a device gets picked at startup
//   /referrals                     referrals
//   /:dongleId                     device dashboard
//   /:dongleId/prime               comma prime
//   /:dongleId/stream              live stream
//   /:dongleId/settings            device settings
//   /:dongleId/:logId              whole drive
//   /:dongleId/:logId/:start/:end  part of a drive, in seconds since the drive started
//   /:dongleId/:start/:end         legacy, absolute millisecond timestamps

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

function toNumber(str) {
  return /^\d+$/.test(str) ? Number(str) : null;
}

/**
 * @typedef {object} UrlState
 * @property {string|null} dongleId
 * @property {'referrals'|'dashboard'|'prime'|'stream'|'settings'|'drive'|null} page
 * @property {string|null} logId
 * @property {{start: number, end: number}|null} zoom drive range in milliseconds, null for the whole drive
 * @property {{start: number, end: number}|null} legacyRange absolute range from a legacy URL
 */

/**
 * @param {string} pathname
 * @returns {UrlState}
 */
export function parseUrl(pathname) {
  const url = { dongleId: null, page: null, logId: null, zoom: null, legacyRange: null };
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!dongleIdRegex.test(first)) {
    return url;
  }

  url.dongleId = first;
  url.page = 'dashboard';
  if (logIdRegex.test(second)) {
    url.page = 'drive';
    url.logId = second;
    const [start, end] = [toNumber(third), toNumber(fourth)];
    if (start !== null && end !== null && start < end) {
      url.zoom = { start: start * 1000, end: end * 1000 };
    }
  } else if (DEVICE_PAGES.includes(second) && !third) {
    url.page = second;
  } else {
    const [start, end] = [toNumber(second), toNumber(third)];
    if (start !== null && end !== null) {
      url.legacyRange = { start, end };
    }
  }
  return url;
}

/**
 * @param {Partial<UrlState>} url
 * @returns {string}
 */
export function buildUrl({ dongleId = null, page = null, logId = null, zoom = null }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }

  const path = [dongleId];
  if (logId) {
    path.push(logId);
    const [start, end] = zoom ? [Math.floor(zoom.start / 1000), Math.floor(zoom.end / 1000)] : [];
    if (start < end) {
      path.push(start, end);
    }
  } else if (DEVICE_PAGES.includes(page)) {
    path.push(page);
  }
  return `/${path.join('/')}`;
}
