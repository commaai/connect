// Every URL connect understands. The URL is the source of truth for what is on
// screen: parseUrl reads it, buildUrl writes it, nothing else builds app URLs.
//
//   /                                pick a device
//   /referrals                       referrals
//   /:dongleId                       device dashboard
//   /:dongleId/prime                 comma prime
//   /:dongleId/stream                live stream
//   /:dongleId/:logId                drive
//   /:dongleId/:logId/:start/:end    part of a drive, in whole seconds from its start
//   /:dongleId/:start/:end           legacy link, in unix ms; replaced by a drive URL
//
// Dialogs are query parameters, so they open over any page (see DIALOGS).

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;

// Each dialog's query parameter, and how to read its value (null if absent).
const DIALOGS = {
  settings: (value) => (DONGLE_ID.test(value) ? value : null), // ?settings=:dongleId  device settings
  'add-device': (value) => value !== null,                      // ?add-device          pair a new device
  filter: (value) => value !== null,                            // ?filter              drive list date filter
};

function parseRange(start, end, scale) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

function parsePath(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals') {
    return { page: 'referrals' };
  }
  if (!DONGLE_ID.test(first)) {
    return { page: 'root' };
  }

  const dongleId = first;
  if ((second === 'prime' || second === 'stream') && !third) {
    return { page: second, dongleId };
  }
  if (LOG_ID.test(second)) {
    return { page: 'drive', dongleId, logId: second, range: parseRange(third, fourth, 1000) };
  }
  const legacyRange = parseRange(second, third, 1);
  if (legacyRange) {
    return { page: 'legacy', dongleId, range: legacyRange };
  }
  return { page: 'dashboard', dongleId };
}

function parseDialogs(search) {
  const params = new URLSearchParams(search);
  return Object.fromEntries(Object.entries(DIALOGS).map(([name, read]) => [name, read(params.get(name))]));
}

export function parseUrl({ pathname, search = '' }) {
  return {
    dongleId: null,
    logId: null,
    range: null,
    ...parsePath(pathname),
    dialogs: parseDialogs(search),
  };
}

export function buildUrl({ page, dongleId, logId, range }) {
  switch (page) {
    case 'referrals':
      return '/referrals';
    case 'dashboard':
      return dongleId ? `/${dongleId}` : '/';
    case 'prime':
    case 'stream':
      return `/${dongleId}/${page}`;
    case 'drive':
      return range
        ? `/${dongleId}/${logId}/${Math.floor(range.start / 1000)}/${Math.ceil(range.end / 1000)}`
        : `/${dongleId}/${logId}`;
    default:
      return '/';
  }
}

// The location with one dialog opened (value) or closed (null), keeping any
// other query parameters.
export function withDialog({ pathname, search }, name, value) {
  const params = new URLSearchParams(search);
  if (value) {
    params.set(name, value === true ? '' : value);
  } else {
    params.delete(name);
  }
  const query = [...params].map(([key, val]) => (val ? `${key}=${encodeURIComponent(val)}` : key)).join('&');
  return { pathname, search: query ? `?${query}` : '' };
}

// Only same-site paths, so a crafted ?r= cannot send the user elsewhere.
export function isSafeRedirect(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}

let lastLocation = null;
let lastNav = null;

// The parsed URL of the current store state, cached per location.
export function selectNav(state) {
  const { location } = state.router;
  if (location !== lastLocation) {
    lastLocation = location;
    lastNav = parseUrl(location);
  }
  return lastNav;
}
