// Every URL the app serves and the location it parses to:
//
//   /                               { page: 'root' }
//   /demo                           { page: 'root' }
//   /referrals                      { page: 'referrals' }
//   /:dongleId                      { page: 'dashboard', dongleId }
//   /:dongleId/prime                { page: 'prime', dongleId }
//   /:dongleId/settings             { page: 'settings', dongleId }
//   /:dongleId/stream               { page: 'stream', dongleId }
//   /:dongleId/:logId               { page: 'drive', dongleId, logId, zoom: null }
//   /:dongleId/:logId/:start/:end   { page: 'drive', dongleId, logId, zoom: { start, end } }
//   /:dongleId/:startMs/:endMs      { page: 'legacy', dongleId, start, end }
//
// Anything else is { page: 'unknown' }, keeping the dongleId if the path starts with one.
// Drive zoom is in milliseconds; the URL holds whole seconds.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'settings', 'stream'];

function parseRange(start, end, scale) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(end) <= Number(start)) return null;
  return { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseLocation(pathname) {
  const [first, second, ...rest] = pathname.split('/').filter(Boolean);

  if (!first || (first === 'demo' && !second)) return { page: 'root' };
  if (first === 'referrals' && !second) return { page: 'referrals' };
  if (!DONGLE_ID.test(first)) return { page: 'unknown' };

  const dongleId = first;
  if (!second) return { page: 'dashboard', dongleId };
  if (DEVICE_PAGES.includes(second) && rest.length === 0) return { page: second, dongleId };

  if (LOG_ID.test(second)) {
    if (rest.length === 0) return { page: 'drive', dongleId, logId: second, zoom: null };
    const zoom = rest.length === 2 && parseRange(rest[0], rest[1], 1000);
    if (zoom) return { page: 'drive', dongleId, logId: second, zoom };
  }

  const legacy = rest.length === 1 && parseRange(second, rest[0], 1);
  if (legacy) return { page: 'legacy', dongleId, ...legacy };

  return { page: 'unknown', dongleId };
}

export function urlFor({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  if (DEVICE_PAGES.includes(page)) return `/${dongleId}/${page}`;
  if (page !== 'drive') return `/${dongleId}`;
  if (!zoom) return `/${dongleId}/${logId}`;
  // round outward so the URL covers the whole selection
  return `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`;
}

// Drives can be shared by link, so they open without signing in.
export function isPublic({ page }) {
  return page === 'drive' || page === 'legacy';
}

export function currentLocation(state) {
  return parseLocation(state.router.location.pathname);
}
