// The URL grammar: parseLocation reads a pathname into the location it names, toPath writes a
// location back as its canonical pathname, and parseLocation(toPath(location)) equals location.
//
//   /:dongleId                          { dongleId }                          device dashboard
//   /:dongleId/prime|stream|settings    { dongleId, page }                    device page
//   /:dongleId/:routeId                 { dongleId, routeId }                 whole drive
//   /:dongleId/:routeId/:start/:end     { dongleId, routeId, start, end }     drive range, seconds in the URL, ms here
//   /:dongleId/:startMs/:endMs          { dongleId, legacyRange }             old drive link (parse only)
//
// Paths without a dongle id (/, /referrals, /demo) are {}. Segments the grammar does not know are ignored.

const DONGLE_ID = /^[0-9a-f]{16}$/;
const ROUTE_ID = /^[0-9a-f-]{20}$/;
const INTEGER = /^\d+$/;
const PAGES = ['prime', 'stream', 'settings'];

function parseRange(start, end, toMillis) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * toMillis, end: Number(end) * toMillis };
}

export function parseLocation(pathname) {
  const [dongleId, segment, start, end] = pathname.split('/').filter(Boolean);
  if (!DONGLE_ID.test(dongleId)) {
    return {};
  }
  if (ROUTE_ID.test(segment)) {
    return { dongleId, routeId: segment, ...parseRange(start, end, 1000) };
  }
  if (PAGES.includes(segment)) {
    return { dongleId, page: segment };
  }
  const legacyRange = parseRange(segment, start, 1);
  return legacyRange ? { dongleId, legacyRange } : { dongleId };
}

export function toPath({ dongleId, page, routeId, start, end }) {
  if (!dongleId) {
    return '/';
  }
  if (!routeId) {
    return page ? `/${dongleId}/${page}` : `/${dongleId}`;
  }
  if (start == null || end == null) {
    return `/${dongleId}/${routeId}`;
  }
  // round outwards, so the URL range always covers the selection
  return `/${dongleId}/${routeId}/${Math.floor(start / 1000)}/${Math.ceil(end / 1000)}`;
}
