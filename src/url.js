// Every URL connect understands. Drive zooms are seconds in the URL, milliseconds in state.
//
//   /                                   { page: 'root' }  (also any unknown URL)
//   /referrals                          { page: 'referrals' }
//   /:dongleId                          { page: 'dashboard', dongleId }
//   /:dongleId/prime|stream|settings    { page, dongleId }
//   /:dongleId/:logId                   { page: 'drive', dongleId, logId }
//   /:dongleId/:logId/:start/:end       { page: 'drive', dongleId, logId, zoom: { start, end } }
//   /:dongleId/:startMs/:endMs          { page: 'legacy', dongleId, zoom: { start, end } }  (old links, never written)

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^[0-9]+$/;
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

function toRange(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(end) <= Number(start)) return null;
  return { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseUrl(pathname) {
  const [dongleId, sub, ...range] = pathname.split('/').filter(Boolean);

  if (dongleId === 'referrals' && !sub) return { page: 'referrals' };
  if (!DONGLE_ID.test(dongleId) || range.length > 2) return { page: 'root' };
  if (!sub) return { page: 'dashboard', dongleId };
  if (DEVICE_PAGES.includes(sub) && !range.length) return { page: sub, dongleId };

  if (LOG_ID.test(sub)) {
    if (!range.length) return { page: 'drive', dongleId, logId: sub };
    const zoom = toRange(range[0], range[1], 1000);
    if (zoom) return { page: 'drive', dongleId, logId: sub, zoom };
  } else if (range.length === 1) {
    const zoom = toRange(sub, range[0], 1);
    if (zoom) return { page: 'legacy', dongleId, zoom };
  }

  return { page: 'root' };
}

export function urlFor({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') return '/referrals';
  if (page === 'dashboard') return `/${dongleId}`;
  if (DEVICE_PAGES.includes(page)) return `/${dongleId}/${page}`;
  if (page !== 'drive') return '/';
  if (!zoom) return `/${dongleId}/${logId}`;
  return `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`;
}
