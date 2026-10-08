// The URL grammar of the app, in one place. parsePath turns a path into a
// route descriptor and pathFor builds a path from one; every other module
// goes through them, so parsing and building always agree.
//
//   /                                device picker
//   /referrals                       referrals page
//   /:dongleId                       device dashboard
//   /:dongleId/prime                 prime checkout / management
//   /:dongleId/stream                live teleop stream
//   /:dongleId/:routeId              whole drive
//   /:dongleId/:routeId/:start/:end  drive range, in seconds
//   /:dongleId/:start/:end           legacy timestamp range, canonicalized
//                                   to a route URL once the route is known
//
// Modals are query parameters on the current page, so the page underneath
// stays addressable and the back button closes them:
//
//   ?settings=<dongleId>             device settings
//   ?uploads=<dongleId>              upload queue
//   ?filter                          drive list date filter
//   ?add-device                      pair a new device

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;

export const Pages = {
  LANDING: 'landing',
  REFERRALS: 'referrals',
  DASHBOARD: 'dashboard',
  PRIME: 'prime',
  STREAM: 'stream',
  DRIVE: 'drive',
  LEGACY_RANGE: 'legacyRange',
};

// parse a path into a route descriptor; range is [startMs, endMs] when present
export function parsePath(pathname) {
  const [dongleId, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (dongleId === 'referrals') {
    return { page: Pages.REFERRALS };
  }
  if (!dongleId || !DONGLE_ID.test(dongleId)) {
    return { page: Pages.LANDING };
  }

  if (second === 'prime' && !third) {
    return { page: Pages.PRIME, dongleId };
  }
  if (second === 'stream' && !third) {
    return { page: Pages.STREAM, dongleId };
  }

  if (ROUTE_ID.test(second)) {
    const range = (third && fourth && NUMBER.test(third) && NUMBER.test(fourth))
      ? [Number(third) * 1000, Number(fourth) * 1000]
      : null;
    return { page: Pages.DRIVE, dongleId, routeId: second, range };
  }

  if (second && third && NUMBER.test(second) && NUMBER.test(third)) {
    return { page: Pages.LEGACY_RANGE, dongleId, range: [Number(second), Number(third)] };
  }

  return { page: Pages.DASHBOARD, dongleId };
}

// build a path from a route descriptor; range is [startMs, endMs]
export function pathFor(route) {
  if (route.page === Pages.REFERRALS) {
    return '/referrals';
  }
  if (!route.dongleId) {
    return '/';
  }

  switch (route.page) {
    case Pages.PRIME:
      return `/${route.dongleId}/prime`;
    case Pages.STREAM:
      return `/${route.dongleId}/stream`;
    case Pages.DRIVE:
      if (!route.routeId) {
        break;
      }
      if (route.range) {
        const [startMs, endMs] = route.range;
        return `/${route.dongleId}/${route.routeId}/${Math.floor(startMs / 1000)}/${Math.floor(endMs / 1000)}`;
      }
      return `/${route.dongleId}/${route.routeId}`;
    default:
      break;
  }
  return `/${route.dongleId}`;
}

// render query params; a param without a value stays a bare flag: ?filter
function buildSearch(query) {
  const parts = [];
  for (const [key, value] of query.entries()) {
    parts.push(value === '' ? key : `${key}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

// add query parameters to a path, keeping any that are already present.
// a null value adds a bare flag: withParams('/dongle', { filter: null }) -> '/dongle?filter'
export function withParams(path, params) {
  const [pathname, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(params)) {
    query.delete(key);
    query.append(key, value ?? '');
  }
  const encoded = buildSearch(query);
  return encoded ? `${pathname}?${encoded}` : pathname;
}

// remove query parameters from a path
export function withoutParams(path, ...keys) {
  const [pathname, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  for (const key of keys) {
    query.delete(key);
  }
  const encoded = buildSearch(query);
  return encoded ? `${pathname}?${encoded}` : pathname;
}
