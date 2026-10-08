// Every URL the app understands, and the view it parses to:
//
//   /referrals                       { page: 'referrals' }
//   /:dongleId                       { page: 'dashboard', dongleId }
//   /:dongleId/prime                 { page: 'prime', dongleId }
//   /:dongleId/stream                { page: 'stream', dongleId }
//   /:dongleId/:logId                { page: 'drive', dongleId, logId, zoom: null }
//   /:dongleId/:logId/:start/:end    { page: 'drive', dongleId, logId, zoom: { start, end } }
//   /:dongleId/:startMs/:endMs       { page: 'legacy', dongleId, start, end }
//   anything else, e.g. / or /demo   { page: 'dashboard' }, which startup sends to the last device
//
// Any of them can carry ?modal=filter|pair|settings to open that modal on top.
// Drive zoom is in milliseconds into the drive, written to the URL in whole seconds.
//
// reducers/location.js turns a parsed URL into state, and actions/history.js fetches what it needs.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream'];
const MODALS = ['filter', 'pair', 'settings'];

function parseRange(start, end, scale) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(end) <= Number(start)) return null;
  return { start: Number(start) * scale, end: Number(end) * scale };
}

function parsePath(pathname) {
  const [dongleId, second, start, end] = pathname.split('/').filter(Boolean);
  if (dongleId === 'referrals' && !second) return { page: 'referrals' };
  if (!DONGLE_ID.test(dongleId)) return { page: 'dashboard' };
  if (!second) return { page: 'dashboard', dongleId };
  if (DEVICE_PAGES.includes(second) && !start) return { page: second, dongleId };
  if (LOG_ID.test(second)) return { page: 'drive', dongleId, logId: second, zoom: parseRange(start, end, 1000) };

  const legacy = !end && parseRange(second, start, 1);
  if (legacy) return { page: 'legacy', dongleId, ...legacy };
  return { page: 'dashboard', dongleId };
}

/** Parses a location ({ pathname, search }) into the view it names, as listed above. */
export function parseLocation({ pathname, search }) {
  const view = parsePath(pathname);
  const modal = new URLSearchParams(search).get('modal');
  view.modal = MODALS.includes(modal) ? modal : null;
  return view;
}

function pathFor({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  // round outward so the URL covers the whole selection
  if (logId && zoom) return `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`;
  if (logId) return `/${dongleId}/${logId}`;
  if (DEVICE_PAGES.includes(page)) return `/${dongleId}/${page}`;
  return `/${dongleId}`;
}

/** Formats a view as a URL, the inverse of parseLocation. A logId makes it a drive page. */
export function urlFor(view) {
  const path = pathFor(view);
  return view.modal ? `${path}?modal=${view.modal}` : path;
}

/** Drives can be shared by link, so their pages open without signing in. */
export function isPublic(page) {
  return page === 'drive' || page === 'legacy';
}
