export const ROUTES = {
  DASHBOARD: 'dashboard',
  DRIVE: 'drive',
  SETTINGS: 'settings',
  PRIME: 'prime',
  STREAM: 'stream',
  REFERRALS: 'referrals',
  LEGACY: 'legacy',
};

// A segment is a dongle id, a log id, or a whole number of seconds - never a
// prefix of one. The anchors matter: without them `/0000aaaa0000aaaazzz` and
// `/2026-08-06--12-00-00zz` are read as valid and sent to the API as-is.
const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const SECONDS = /^\d+$/;

// Pages that are a single extra segment after the dongle id.
const DEVICE_PAGES = [ROUTES.SETTINGS, ROUTES.PRIME, ROUTES.STREAM];

const seconds = (value) => (SECONDS.test(value ?? '') ? Number(value) : null);

export function parseUrl(pathname) {
  const none = { page: null, dongleId: null, routeId: null, zoom: null };

  if (typeof pathname !== 'string') {
    return none;
  }

  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === ROUTES.REFERRALS) {
    return { ...none, page: ROUTES.REFERRALS };
  }

  const dongleId = DONGLE_ID.test(parts[0]) ? parts[0] : null;
  if (!dongleId) {
    return none;
  }

  const base = { ...none, dongleId };

  if (parts.length === 1) {
    return { ...base, page: ROUTES.DASHBOARD };
  }

  if (parts.length === 2 && DEVICE_PAGES.includes(parts[1])) {
    return { ...base, page: parts[1] };
  }

  if (LOG_ID.test(parts[1])) {
    // `/<dongleId>/<logId>/<start>/<end>` - seconds, relative to the route.
    const start = seconds(parts[2]);
    const end = seconds(parts[3]);
    const zoom = start != null && end != null ? { start: start * 1000, end: end * 1000 } : null;
    return { ...base, page: ROUTES.DRIVE, routeId: parts[1], zoom };
  }

  // `/<dongleId>/<start>/<end>` - the pre-logId form. Absolute milliseconds,
  // converted to a logId by the history middleware once the lookup resolves.
  const start = seconds(parts[1]);
  const end = seconds(parts[2]);
  if (start != null && end != null) {
    return { ...base, page: ROUTES.LEGACY, zoom: { start, end } };
  }

  return { ...base, page: ROUTES.DASHBOARD };
}

// The inverse of parseUrl. Every navigation goes through here, so a route can
// only have one shape and parseUrl(buildUrl(d)) === d holds for every page.
export function buildUrl({ page = ROUTES.DASHBOARD, dongleId, routeId, zoom } = {}) {
  if (page === ROUTES.REFERRALS) {
    return '/referrals';
  }

  if (!dongleId) {
    return '/';
  }

  if (DEVICE_PAGES.includes(page)) {
    return `/${dongleId}/${page}`;
  }

  if (page === ROUTES.DRIVE && routeId) {
    const range = zoom && zoom.start != null && zoom.end != null
      ? `/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`
      : '';
    return `/${dongleId}/${routeId}${range}`;
  }

  if (page === ROUTES.LEGACY && zoom && zoom.start != null && zoom.end != null) {
    return `/${dongleId}/${zoom.start}/${zoom.end}`;
  }

  return `/${dongleId}`;
}
