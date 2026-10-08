// Every URL connect understands. parseUrl() reads them, the *Url() helpers write them.
//
//   /                               the last selected device
//   /referrals                      referrals
//   /:dongleId                      device dashboard
//   /:dongleId/settings             device settings
//   /:dongleId/prime                comma prime
//   /:dongleId/stream               live stream
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   drive zoomed to [start, end], in seconds
//   /:dongleId/:start/:end          legacy link to a time range, in milliseconds

export const Page = {
  HOME: 'home',
  REFERRALS: 'referrals',
  DASHBOARD: 'dashboard',
  SETTINGS: 'settings',
  PRIME: 'prime',
  STREAM: 'stream',
  DRIVE: 'drive',
};

const DEVICE_PAGES = [Page.SETTINGS, Page.PRIME, Page.STREAM];

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const WHOLE_NUMBER = /^\d+$/;

// time units, in milliseconds
const SECONDS = 1000;
const MILLISECONDS = 1;

// a time range in milliseconds, or null if the numbers in the URL aren't a valid range
function parseRange(start, end, unit) {
  if (!WHOLE_NUMBER.test(start) || !WHOLE_NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * unit, end: Number(end) * unit };
}

export function parseUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second, third, fourth] = parts;
  const url = { page: Page.HOME, dongleId: null, logId: null, zoom: null, legacyRange: null };

  if (parts.length === 1 && dongleId === Page.REFERRALS) {
    return { ...url, page: Page.REFERRALS };
  }
  if (!DONGLE_ID.test(dongleId)) {
    return url;
  }
  if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
    return { ...url, page: second, dongleId };
  }
  if (LOG_ID.test(second)) {
    return { ...url, page: Page.DRIVE, dongleId, logId: second, zoom: parseRange(third, fourth, SECONDS) };
  }
  if (parts.length === 3) {
    return { ...url, page: Page.DASHBOARD, dongleId, legacyRange: parseRange(second, third, MILLISECONDS) };
  }
  return { ...url, page: Page.DASHBOARD, dongleId };
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

// zoom is in milliseconds; rounded outwards so the URL always covers the selection
export function driveUrl(dongleId, logId, zoom = null) {
  const url = `/${dongleId}/${logId}`;
  if (!zoom) {
    return url;
  }
  return `${url}/${Math.floor(zoom.start / SECONDS)}/${Math.ceil(zoom.end / SECONDS)}`;
}
