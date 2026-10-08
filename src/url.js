// URL grammar — the single source of truth for every URL Connect understands.
//
//   /                                 dashboard (device list)
//   /referrals                        referrals page
//   /:dongleId                        device dashboard
//   /:dongleId/prime                  prime subscription page
//   /:dongleId/stream                 live stream (teleop)
//   /:dongleId/settings               device settings (modal over the dashboard)
//   /:dongleId/:start/:end            device timeline range (unix seconds)
//   /:dongleId/:routeId               drive view
//   /:dongleId/:routeId/:start/:end   drive view, zoomed to a range (unix seconds)
//
// A dongle id is 16 lowercase hex chars, a route id looks like
// `2026-08-06--12-00-00`. Anything else parses to null and renders the
// dashboard, exactly like before — but unlike the old helpers, a path can
// never parse into a half-valid route (e.g. NaN range bounds).
//
// Ranges in the URL are unix seconds; redux state keeps milliseconds.
// parseLocation() converts nothing — it reports URL units — so the
// seconds/millis boundary stays in one obvious place at the call sites.

const DONGLE_ID_RE = /^[a-f0-9]{16}$/;
const ROUTE_ID_RE = /^[a-f0-9-]{20}$/;
const SECONDS_RE = /^\d+$/;

/**
 * Parse a pathname into a route object. One split, arms checked in order,
 * no partial results: either the whole path matches an arm or it is null.
 */
export function parseLocation(pathname) {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { page: 'dashboard', dongleId: null, routeId: null, start: null, end: null };
  }

  if (parts.length === 1 && parts[0] === 'referrals') {
    return { page: 'referrals', dongleId: null, routeId: null, start: null, end: null };
  }

  const [dongleId, second, third, fourth] = parts;
  if (!DONGLE_ID_RE.test(dongleId)) {
    return null;
  }

  if (parts.length === 1) {
    return { page: 'device', dongleId, routeId: null, start: null, end: null };
  }

  if (parts.length === 2) {
    if (second === 'prime') {
      return { page: 'prime', dongleId, routeId: null, start: null, end: null };
    }
    if (second === 'stream') {
      return { page: 'stream', dongleId, routeId: null, start: null, end: null };
    }
    if (second === 'settings') {
      return { page: 'settings', dongleId, routeId: null, start: null, end: null };
    }
    if (ROUTE_ID_RE.test(second)) {
      return { page: 'drive', dongleId, routeId: second, start: null, end: null };
    }
    return null;
  }

  if (parts.length === 3) {
    const [start, end] = [Number(second), Number(third)];
    if (SECONDS_RE.test(second) && SECONDS_RE.test(third)) {
      return { page: 'device', dongleId, routeId: null, start, end };
    }
    return null;
  }

  if (parts.length === 4) {
    const [start, end] = [Number(third), Number(fourth)];
    if (ROUTE_ID_RE.test(second) && SECONDS_RE.test(third) && SECONDS_RE.test(fourth)) {
      return { page: 'drive', dongleId, routeId: second, start, end };
    }
    return null;
  }

  return null;
}

/**
 * Build a pathname from a route object. This is the exact inverse of
 * parseLocation(): every route it produces parses back to itself
 * (see url.test.js). Only valid shapes are producible.
 */
export function buildLocation({ page, dongleId = null, routeId = null, start = null, end = null }) {
  switch (page) {
    case 'dashboard':
      return '/';
    case 'referrals':
      return '/referrals';
    case 'device':
      break; // validated below
    case 'prime':
    case 'stream':
    case 'settings':
    case 'drive':
      break; // validated below
    default:
      throw new Error(`buildLocation: unknown page "${page}"`);
  }

  if (!dongleId || !DONGLE_ID_RE.test(dongleId)) {
    throw new Error(`buildLocation: page "${page}" needs a valid dongleId`);
  }

  if (page === 'device') {
    if (start != null || end != null) {
      if (!SECONDS_RE.test(String(start)) || !SECONDS_RE.test(String(end))) {
        throw new Error('buildLocation: range bounds must be unix seconds');
      }
      return `/${dongleId}/${start}/${end}`;
    }
    return `/${dongleId}`;
  }

  if (page === 'drive') {
    if (!routeId || !ROUTE_ID_RE.test(routeId)) {
      throw new Error('buildLocation: page "drive" needs a valid routeId');
    }
    if (start != null || end != null) {
      if (!SECONDS_RE.test(String(start)) || !SECONDS_RE.test(String(end))) {
        throw new Error('buildLocation: range bounds must be unix seconds');
      }
      return `/${dongleId}/${routeId}/${start}/${end}`;
    }
    return `/${dongleId}/${routeId}`;
  }

  return `/${dongleId}/${page}`;
}
