// The URL grammar of connect. Every page is addressed by its URL:
//
//   /referrals                          referrals
//   /:dongleId                          dashboard
//   /:dongleId/prime                    prime
//   /:dongleId/stream                   stream
//   /:dongleId/settings                 settings
//   /:dongleId/:logId                   drive
//   /:dongleId/:logId/:start/:end       drive, zoomed to [start, end] seconds into the route
//   /:dongleId/:startMs/:endMs          legacy timestamp range, redirected to its drive
//
// Unknown paths fall back to the device dashboard, or to the root page without a
// device. parseUrl and buildUrl are inverses for every page above except the
// legacy range, which is only ever parsed.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

function range(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const url = { page: 'root', dongleId: null, logId: null, zoom: null, legacyRange: null };

  if (parts.length === 1 && parts[0] === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!DONGLE_ID.test(parts[0])) {
    return url;
  }

  const [dongleId, ...rest] = parts;
  url.dongleId = dongleId;
  url.page = 'dashboard';

  if (rest.length === 1 && DEVICE_PAGES.includes(rest[0])) {
    url.page = rest[0];
  } else if (LOG_ID.test(rest[0]) && (rest.length === 1 || rest.length === 3)) {
    url.page = 'drive';
    url.logId = rest[0];
    url.zoom = rest.length === 3 ? range(rest[1], rest[2], 1000) : null;
  } else if (rest.length === 2) {
    url.legacyRange = range(rest[0], rest[1], 1);
  }
  return url;
}

// zoom is in route-relative milliseconds like redux state, and is rounded down to
// whole seconds. A missing page defaults to the drive when there is a logId, else the dashboard.
export function buildUrl({ page, dongleId, logId, zoom }) {
  const target = page || (logId ? 'drive' : 'dashboard');
  if (target === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (target === 'drive') {
    const zoomPath = zoom ? `/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}` : '';
    return `/${dongleId}/${logId}${zoomPath}`;
  }
  return DEVICE_PAGES.includes(target) ? `/${dongleId}/${target}` : `/${dongleId}`;
}

// The page the app is showing, parsed from the router state.
export function currentUrl(state) {
  return parseUrl(state.router.location.pathname);
}
