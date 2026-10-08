// Every URL connect understands:
//
//   /referrals|add-device
//   /:dongleId                          device dashboard
//   /:dongleId/prime|stream|settings    device page
//   /:dongleId/:logId[/:start/:end]     drive, optional range in seconds
//   /:dongleId/:startMs/:endMs          legacy drive range, converted to the form above
//
// parseUrl and urlFor are inverses for all but the legacy form.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const PAGES = ['referrals', 'add-device'];
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

export function parseUrl(pathname) {
  const url = { dongleId: null, page: null, logId: null, zoom: null };
  const [first, ...rest] = pathname.split('/').filter(Boolean);

  if (PAGES.includes(first) && !rest.length) {
    return { ...url, page: first };
  }
  if (!DONGLE_ID.test(first)) {
    return url;
  }

  url.dongleId = first;
  const [second, start, end] = rest;

  if (!second) {
    return { ...url, page: 'dashboard' };
  }
  if (rest.length === 1 && DEVICE_PAGES.includes(second)) {
    return { ...url, page: second };
  }
  if (LOG_ID.test(second)) {
    const ranged = NUMBER.test(start) && NUMBER.test(end);
    const zoom = ranged ? { start: Number(start) * 1000, end: Number(end) * 1000 } : null;
    return { ...url, page: 'drive', logId: second, zoom };
  }
  if (rest.length === 2 && NUMBER.test(second) && NUMBER.test(start)) {
    return { ...url, page: 'drive', zoom: { start: Number(second), end: Number(start) } };
  }
  return url;
}

export function urlFor({ dongleId, page, logId, zoom }) {
  if (PAGES.includes(page)) {
    return `/${page}`;
  }
  if (!dongleId) {
    return '/';
  }
  if (logId) {
    const range = zoom ? `/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}` : '';
    return `/${dongleId}/${logId}${range}`;
  }
  if (DEVICE_PAGES.includes(page)) {
    return `/${dongleId}/${page}`;
  }
  return `/${dongleId}`;
}

export const getPage = (state) => parseUrl(state.router.location.pathname).page;
