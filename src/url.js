// Every page in the app is addressed by its URL:
//
//   /                                  home, redirects to the remembered or first device
//   /referrals                         referrals
//   /:dongleId                         dashboard
//   /:dongleId/prime                   prime
//   /:dongleId/stream                  stream
//   /:dongleId/settings                device settings
//   /:dongleId/:logId                  drive
//   /:dongleId/:logId/:start/:end      drive, zoomed to [start, end] seconds
//   /:dongleId/:startMs/:endMs         legacy drive link, replaced by /:dongleId/:logId
//
// Anything else is home.

export const Page = {
  HOME: 'home',
  REFERRALS: 'referrals',
  DASHBOARD: 'dashboard',
  PRIME: 'prime',
  STREAM: 'stream',
  SETTINGS: 'settings',
  DRIVE: 'drive',
};

// pages addressed as /:dongleId/:page
const DEVICE_PAGES = [Page.PRIME, Page.STREAM, Page.SETTINGS];

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;

function parseRange(start, end) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start), end: Number(end) };
}

// zoom and legacyRange are in milliseconds
function url(page, fields) {
  return { page, dongleId: null, logId: null, zoom: null, legacyRange: null, ...fields };
}

export function parseUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second] = parts;

  if (parts.length === 1 && dongleId === 'referrals') {
    return url(Page.REFERRALS);
  }
  if (!DONGLE_ID.test(dongleId)) {
    return url(Page.HOME);
  }

  if (parts.length === 1) {
    return url(Page.DASHBOARD, { dongleId });
  }
  if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
    return url(second, { dongleId });
  }
  if (parts.length === 2 && LOG_ID.test(second)) {
    return url(Page.DRIVE, { dongleId, logId: second });
  }

  // both zoomed and legacy drives end in a range
  const range = parseRange(...parts.slice(-2));
  if (parts.length === 4 && LOG_ID.test(second) && range) {
    return url(Page.DRIVE, { dongleId, logId: second, zoom: { start: range.start * 1000, end: range.end * 1000 } });
  }
  if (parts.length === 3 && range) {
    return url(Page.DRIVE, { dongleId, legacyRange: range });
  }
  return url(Page.HOME);
}

// Inverse of parseUrl. Without a page: logId -> drive, dongleId -> dashboard, else home.
// Zoom is rounded outward so a sub-second selection never becomes empty.
export function buildUrl({ page, dongleId, logId, zoom }) {
  if (page === Page.REFERRALS) {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (logId && zoom) {
    return `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`;
  }
  if (logId) {
    return `/${dongleId}/${logId}`;
  }
  if (DEVICE_PAGES.includes(page)) {
    return `/${dongleId}/${page}`;
  }
  return `/${dongleId}`;
}

export const selectPage = (state) => parseUrl(state.router.location.pathname).page;
