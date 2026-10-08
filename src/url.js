// URL <-> navigation state.
//
// The URL is the source of truth for where the user is. These two functions
// are the only code that knows what a URL looks like:
//
//   parseUrl(pathname, search)  turns a URL into a plain state object
//   formatUrl(state)            turns that object back into a URL
//
// To teach the app a new page or URL argument, extend the object both
// functions pass around. Everything else (initial state, the history
// middleware, navigation actions, analytics) works through this module.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const SECONDS = /^\d+$/;

export const Pages = {
  DASHBOARD: 'dashboard',
  DRIVE: 'drive',
  PRIME: 'prime',
  STREAM: 'stream',
  REFERRALS: 'referrals',
};

/**
 * Which view, device and drive range does this URL describe?
 *
 * @param {string} pathname
 * @param {string} [search] query part of the location, may be empty
 * @returns {{
 *  page: string, dongleId: string | null,
 *  routeId: string | null, zoom: {start: number, end: number} | null,
 *  timeRange: {start: number, end: number} | null,
 *  settingsDongleId: string | null,
 * }} zoom and timeRange are milliseconds and seconds respectively
 */
export function parseUrl(pathname, search = '') {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second, third, fourth] = parts;

  const url = {
    page: Pages.DASHBOARD,
    dongleId: DONGLE_ID.test(dongleId) ? dongleId : null,
    routeId: null,
    zoom: null, // selected range within a drive, in milliseconds
    timeRange: null, // dashboard date range, in seconds
    settingsDongleId: null,
  };

  if (!url.dongleId) {
    if (parts[0] === 'referrals') {
      url.page = Pages.REFERRALS;
    }
    return url;
  }

  if (second === 'prime') {
    url.page = Pages.PRIME;
  } else if (second === 'stream') {
    url.page = Pages.STREAM;
  } else if (ROUTE_ID.test(second)) {
    url.page = Pages.DRIVE;
    url.routeId = second;
    if (SECONDS.test(third) && SECONDS.test(fourth)) {
      url.zoom = { start: Number(third) * 1000, end: Number(fourth) * 1000 };
    }
  } else if (SECONDS.test(second) && SECONDS.test(third)) {
    // drives used to be addressed by unix timestamps, before log IDs existed
    url.timeRange = { start: Number(second), end: Number(third) };
  }

  const settingsDongleId = new URLSearchParams(search).get('settings');
  if (DONGLE_ID.test(settingsDongleId)) {
    url.settingsDongleId = settingsDongleId;
  }

  return url;
}

/**
 * Build the URL for a navigation state. Pass a partial state; anything left
 * out falls back to the device dashboard.
 *
 * @param {object} url fields of the parseUrl result, all optional
 * @returns {string} path with query, starting with a slash
 */
export function formatUrl(url) {
  const {
    page = Pages.DASHBOARD, dongleId, routeId, zoom, settingsDongleId,
  } = url;

  if (page === Pages.REFERRALS) {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }

  const path = [dongleId];
  if (page === Pages.PRIME) {
    path.push('prime');
  } else if (page === Pages.STREAM) {
    path.push('stream');
  } else if (page === Pages.DRIVE && routeId) {
    path.push(routeId);
    if (zoom) {
      path.push(Math.floor(zoom.start / 1000), Math.floor(zoom.end / 1000));
    }
  }

  const search = settingsDongleId ? `?settings=${settingsDongleId}` : '';
  return `/${path.join('/')}${search}`;
}

let cachedLocation = null;
let cachedUrl = null;

/**
 * Parse a router location object. Memoized on the location identity, so
 * components can select from it on every store change without re-parsing.
 *
 * @param {{pathname: string, search?: string}} location
 */
export function parseLocation(location) {
  if (location !== cachedLocation) {
    cachedLocation = location;
    cachedUrl = parseUrl(location.pathname, location.search || '');
  }
  return cachedUrl;
}
