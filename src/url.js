// Every URL the app understands is described here, and nowhere else.
//
//   /                                 home
//   /referrals                        referrals
//   /auth/...                         login callback
//   /<dongleId>                       device
//   /<dongleId>/prime                 device, prime page
//   /<dongleId>/stream                device, body teleop
//   /<dongleId>/<routeId>             route
//   /<dongleId>/<routeId>/<s>/<e>     route, zoomed to seconds s..e
//   /<dongleId>/<s>/<e>               legacy time range (unix seconds)
//
// parseLocation() turns a pathname into a plain description of the page.
// buildPath() does the opposite. Adding a new page means adding one case to each.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const SECONDS = /^\d+$/;

export const Pages = {
  HOME: 'home',
  AUTH: 'auth',
  REFERRALS: 'referrals',
  DEVICE: 'device',
  PRIME: 'prime',
  STREAM: 'stream',
  ROUTE: 'route',
  RANGE: 'range',
  UNKNOWN: 'unknown',
};

const isSeconds = (...parts) => parts.every((part) => SECONDS.test(part));

/**
 * @returns {{
 *   page: string,
 *   dongleId: string | null,
 *   routeId: string | null,
 *   zoom: { start: number, end: number } | null,   // route zoom, in milliseconds
 *   range: { start: number, end: number } | null,  // legacy time range, in seconds
 * }}
 */
export function parseLocation(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const result = { page: Pages.UNKNOWN, dongleId: null, routeId: null, zoom: null, range: null };

  if (parts.length === 0) {
    return { ...result, page: Pages.HOME };
  }
  if (parts[0] === 'auth') {
    return { ...result, page: Pages.AUTH };
  }
  if (parts[0] === 'referrals' && parts.length === 1) {
    return { ...result, page: Pages.REFERRALS };
  }
  if (!DONGLE_ID.test(parts[0])) {
    return result;
  }

  const [dongleId, second, third, fourth] = parts;
  result.dongleId = dongleId;
  result.page = Pages.DEVICE;

  if (parts.length === 2 && second === 'prime') {
    result.page = Pages.PRIME;
  } else if (parts.length === 2 && second === 'stream') {
    result.page = Pages.STREAM;
  } else if (ROUTE_ID.test(second ?? '')) {
    result.page = Pages.ROUTE;
    result.routeId = second;
    if (parts.length >= 4 && isSeconds(third, fourth)) {
      result.zoom = { start: Number(third) * 1000, end: Number(fourth) * 1000 };
    }
  } else if (parts.length >= 3 && isSeconds(second, third)) {
    result.page = Pages.RANGE;
    result.range = { start: Number(second), end: Number(third) };
  }

  return result;
}

/**
 * Inverse of parseLocation. `zoom` is in milliseconds and is written out in whole seconds.
 */
export function buildPath({ page = Pages.HOME, dongleId = null, routeId = null, zoom = null } = {}) {
  switch (page) {
    case Pages.REFERRALS:
      return '/referrals';
    case Pages.DEVICE:
      return `/${dongleId}`;
    case Pages.PRIME:
      return `/${dongleId}/prime`;
    case Pages.STREAM:
      return `/${dongleId}/stream`;
    case Pages.ROUTE:
      return zoom
        ? `/${dongleId}/${routeId}/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`
        : `/${dongleId}/${routeId}`;
    default:
      return '/';
  }
}
