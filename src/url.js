// The URL decides what is on screen. These are all the URLs the app
// understands, with the location each one parses into:
//
//   /                                 {}                                     your default device
//   /referrals                        { page: 'referrals' }
//   /:dongleId                        { dongleId }                           device dashboard
//   /:dongleId/prime                  { dongleId, page: 'prime' }
//   /:dongleId/settings               { dongleId, page: 'settings' }
//   /:dongleId/stream                 { dongleId, page: 'stream' }
//   /:dongleId/:logId/:start/:end     { dongleId, logId, zoom }              part of a drive, in seconds
//   /:dongleId/:logId                 { dongleId, logId }                    whole drive
//   /:dongleId/:startMs/:endMs        { dongleId, legacyRange }              old links, see actions/history.js
//
// Times in a location are in milliseconds: zoom is relative to the start of
// the drive, legacyRange is absolute. buildUrl() is the inverse of parseUrl().
//
// When the URL changes, applyLocation() in reducers/location.js puts the new
// location into the state, then the middleware in actions/history.js loads
// whatever the new screen needs.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const DEVICE_PAGES = ['prime', 'settings', 'stream'];

const isRange = (start, end) => /^\d+$/.test(start) && /^\d+$/.test(end) && Number(start) < Number(end);

export function parseUrl(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals' && !second) {
    return { page: 'referrals' };
  }
  if (!DONGLE_ID.test(first)) {
    return {};
  }

  const dongleId = first;
  if (DEVICE_PAGES.includes(second) && !third) {
    return { dongleId, page: second };
  }
  if (LOG_ID.test(second) && isRange(third, fourth)) {
    return { dongleId, logId: second, zoom: { start: Number(third) * 1000, end: Number(fourth) * 1000 } };
  }
  if (LOG_ID.test(second)) {
    return { dongleId, logId: second };
  }
  if (isRange(second, third)) {
    return { dongleId, legacyRange: { start: Number(second), end: Number(third) } };
  }
  return { dongleId };
}

export function buildUrl({ dongleId, logId, zoom, page }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (logId && zoom) {
    return `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`;
  }
  if (logId) {
    return `/${dongleId}/${logId}`;
  }
  return page ? `/${dongleId}/${page}` : `/${dongleId}`;
}
