// Every URL in connect and the location it parses to:
//
//   /referrals                         { page: 'referrals' }
//   /:dongleId                         { dongleId }
//   /:dongleId/(prime|stream)          { dongleId, page }
//   /:dongleId/:routeId                { dongleId, routeId }
//   /:dongleId/:routeId/:start/:end    { dongleId, routeId, range }
//   /:dongleId/:start/:end             { dongleId, legacyRange }
//
// and on any of them, a dialog over the page:
//
//   ?modal=(filter|pair|settings)      { modal }
//
// A range is in milliseconds into the route, written as whole seconds in the URL.
// A legacy range is in unix milliseconds and is resolved to a route on load.
// Anything else, including /, parses to an empty location.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream'];
const MODALS = ['filter', 'pair', 'settings'];

function parseRange(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseLocation(pathname, search = '') {
  const location = { dongleId: null, page: null, routeId: null, range: null, legacyRange: null, modal: null };
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, ...rest] = parts;

  if (parts.length === 1 && first === 'referrals') {
    location.page = 'referrals';
  } else if (DONGLE_ID.test(first)) {
    location.dongleId = first;
    if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
      location.page = second;
    } else if (ROUTE_ID.test(second)) {
      location.routeId = second;
      if (parts.length === 4) {
        location.range = parseRange(rest[0], rest[1], 1000);
      }
    } else if (parts.length === 3) {
      location.legacyRange = parseRange(second, rest[0], 1);
    }
  }

  const modal = new URLSearchParams(search).get('modal');
  if (MODALS.includes(modal)) {
    location.modal = modal;
  }

  return location;
}

function pathOf({ dongleId, page, routeId, range, legacyRange }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (legacyRange) {
    return `/${dongleId}/${legacyRange.start}/${legacyRange.end}`;
  }
  if (page) {
    return `/${dongleId}/${page}`;
  }
  if (!routeId) {
    return `/${dongleId}`;
  }
  if (!range) {
    return `/${dongleId}/${routeId}`;
  }
  // a range is never written shorter than the one second the URL can show
  const start = Math.floor(range.start / 1000);
  const end = Math.max(Math.floor(range.end / 1000), start + 1);
  return `/${dongleId}/${routeId}/${start}/${end}`;
}

export function toPath(location) {
  const query = new URLSearchParams();
  if (location.modal) {
    query.set('modal', location.modal);
  }
  const search = query.toString();
  return search ? `${pathOf(location)}?${search}` : pathOf(location);
}
