// Every page in connect has a URL, and this file is the only place that knows
// what those URLs look like: parseUrl() reads one, the *Url() helpers write one.
//
//   /                              home: the last selected device
//   /referrals                     referrals
//   /:dongleId                     device dashboard
//   /:dongleId/settings            device settings
//   /:dongleId/prime               comma prime
//   /:dongleId/stream              live stream
//   /:dongleId/:logId              drive
//   /:dongleId/:logId/:start/:end  drive, zoomed to [start, end] in seconds
//   /:dongleId/:start/:end         legacy link to a time range, in milliseconds

export const Page = {
  HOME: 'home',
  REFERRALS: 'referrals',
  DASHBOARD: 'dashboard',
  SETTINGS: 'settings',
  PRIME: 'prime',
  STREAM: 'stream',
  DRIVE: 'drive',
};

// pages addressed as /:dongleId/<page>
const DEVICE_PAGES = [Page.SETTINGS, Page.PRIME, Page.STREAM];

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;

function urlState(page, { dongleId = null, logId = null, zoom = null, legacyRange = null } = {}) {
  return { page, dongleId, logId, zoom, legacyRange };
}

function parseRange(start, end, scale) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, segment, ...rest] = parts;

  if (parts.length === 1 && dongleId === Page.REFERRALS) {
    return urlState(Page.REFERRALS);
  }
  if (!DONGLE_ID.test(dongleId)) {
    return urlState(Page.HOME);
  }
  if (parts.length === 2 && DEVICE_PAGES.includes(segment)) {
    return urlState(segment, { dongleId });
  }
  if (LOG_ID.test(segment)) {
    return urlState(Page.DRIVE, { dongleId, logId: segment, zoom: parseRange(rest[0], rest[1], 1000) });
  }
  if (parts.length === 3) {
    return urlState(Page.DASHBOARD, { dongleId, legacyRange: parseRange(segment, rest[0], 1) });
  }
  return urlState(Page.DASHBOARD, { dongleId });
}

export const REFERRALS_URL = `/${Page.REFERRALS}`;

export function deviceUrl(dongleId) {
  return dongleId ? `/${dongleId}` : '/';
}

export function settingsUrl(dongleId) {
  return `/${dongleId}/${Page.SETTINGS}`;
}

export function primeUrl(dongleId) {
  return `/${dongleId}/${Page.PRIME}`;
}

export function streamUrl(dongleId) {
  return `/${dongleId}/${Page.STREAM}`;
}

// zoom is in milliseconds, the URL in whole seconds
export function driveUrl(dongleId, logId, zoom = null) {
  const url = `/${dongleId}/${logId}`;
  if (!zoom) {
    return url;
  }
  return `${url}/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`;
}
