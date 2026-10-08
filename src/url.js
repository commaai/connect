// The app's URL grammar, parsed and built in exactly one place.
//
//   /                             dashboard of the default device
//   /:dongleId                    dashboard of one device
//   /:dongleId/:logId             drive view, whole route
//   /:dongleId/:logId/:from/:to   drive view zoomed to [from, to) (seconds in the URL)
//   /:dongleId/prime              comma prime
//   /:dongleId/stream             live stream / teleop
//   /:dongleId/settings           device settings modal
//   /referrals                    referrals page (global, no device context)
//   /auth/...                     auth handshake, owned by @commaai/my-comma-auth
//   /:dongleId/:start/:end        legacy timestamp range, resolved to a drive on load
//
// Everything the SPA learns from the URL comes from parseLocation(); every path
// the SPA navigates to is produced by buildPath() (or urlForState(), which wraps
// it for timeline selections). They are inverses of each other for every page
// above: parseLocation(buildPath(loc)) deep-equals loc.
//
// The URL -> state direction happens in exactly one place,
// src/actions/history.js: on every location change the middleware parses the
// path once and dispatches only the state that actually differs. Components
// never look at the pathname; they read redux state.
//
// Query arguments are deliberately not part of this grammar: they are read
// where they're used, with URLSearchParams (?pair in App.jsx, ?r in
// explorer.jsx, ?ci in analytics.js). Add new ones the same way.

export const PAGES = Object.freeze({
  DASHBOARD: 'dashboard',
  DRIVE: 'drive',
  PRIME: 'prime',
  STREAM: 'stream',
  SETTINGS: 'settings',
  REFERRALS: 'referrals',
  AUTH: 'auth',
  UNKNOWN: 'unknown',
});

const DONGLE_ID_REGEX = /^[a-f0-9]{16}$/;
const LOG_ID_REGEX = /^[a-f0-9-]{20}$/;

const NAMED_PAGES = new Map([
  ['prime', PAGES.PRIME],
  ['stream', PAGES.STREAM],
  ['settings', PAGES.SETTINGS],
]);

/**
 * Parse a pathname into the location it describes.
 *
 * Always returns the full shape so callers can rely on it:
 *   page         one of PAGES; what should be open
 *   dongleId     selected device, or null when the path has no device
 *   logId        selected route (page === 'drive'), or null
 *   zoom         { start, end } selection in milliseconds, or null when the
 *                drive URL doesn't carry a range
 *   legacyRange  { start, end } raw values of an old-style timestamp range
 *                (page === 'dashboard'), or null
 *
 * Malformed segments are dropped rather than propagated: a drive URL with
 * non-numeric range segments parses as a whole-route drive, and anything that
 * doesn't match the grammar above parses as 'unknown' (rendered like the
 * dashboard) instead of producing NaNs.
 */
export function parseLocation(pathname) {
  const parts = String(pathname ?? '').split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  const location = {
    page: PAGES.DASHBOARD,
    dongleId: first !== undefined && DONGLE_ID_REGEX.test(first) ? first : null,
    logId: null,
    zoom: null,
    legacyRange: null,
  };

  if (parts.length === 0) {
    return location; // '/'
  }
  if (first === 'referrals' && parts.length === 1) {
    return { ...location, page: PAGES.REFERRALS };
  }
  if (first === 'auth') {
    return { ...location, page: PAGES.AUTH };
  }
  if (location.dongleId === null) {
    // No device in the first segment: /demo and other special paths land here
    // and render like the dashboard of whatever device ends up selected.
    return { ...location, page: PAGES.UNKNOWN };
  }

  if (parts.length === 1) {
    return location; // /:dongleId
  }
  if (parts.length === 2 && NAMED_PAGES.has(second)) {
    return { ...location, page: NAMED_PAGES.get(second) };
  }
  if (LOG_ID_REGEX.test(second)) {
    location.page = PAGES.DRIVE;
    location.logId = second;
    if (parts.length >= 4) {
      const start = Number(third) * 1000;
      const end = Number(fourth) * 1000;
      if (Number.isFinite(start) && Number.isFinite(end)) {
        location.zoom = { start, end };
      }
    }
    return location;
  }
  if (parts.length >= 3) {
    // Legacy /:dongleId/:start/:end timestamp range; actions/history.js resolves
    // it to a drive (and rewrites the URL) once the routes for it are known.
    const start = Number(second);
    const end = Number(third);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      location.legacyRange = { start, end };
    }
  }
  return location;
}

/**
 * Build the path for a location: the inverse of parseLocation().
 *
 * Zoom is given in milliseconds (like state.zoom) and stored in the URL as
 * whole seconds, matching parseLocation(). Drive locations without a logId, or
 * unknown pages, degrade to the device dashboard.
 */
export function buildPath({ page = PAGES.DASHBOARD, dongleId = null, logId = null, zoom = null } = {}) {
  if (page === PAGES.REFERRALS) {
    return '/referrals';
  }
  if (page === PAGES.AUTH) {
    return '/auth';
  }

  const parts = [];
  if (dongleId) {
    parts.push(dongleId);
  }

  if (page === PAGES.DRIVE && logId) {
    parts.push(logId);
    if (zoom && Number.isFinite(zoom.start) && Number.isFinite(zoom.end)) {
      parts.push(Math.floor(zoom.start / 1000), Math.floor(zoom.end / 1000));
    }
  } else if (page === PAGES.PRIME) {
    parts.push('prime');
  } else if (page === PAGES.STREAM) {
    parts.push('stream');
  } else if (page === PAGES.SETTINGS) {
    parts.push('settings');
  }

  return `/${parts.join('/')}`;
}
