// Every URL connect understands. parseLocation() reads them and urlFor() writes them.
//
//   /                               the last selected device
//   /referrals                      referrals
//   /:dongleId                      device dashboard
//   /:dongleId/prime                comma prime
//   /:dongleId/stream               live stream
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   drive zoomed to [start, end], in seconds from the start of the drive
//   /:dongleId/:start/:end          legacy link to a time range, in unix milliseconds
//
// Any page can show one dialog on top of it with ?dialog=<name>.
// Paths that match nothing above lead to the last selected device, like /.

export const Page = {
  AUTH: 'auth',
  HOME: 'home',
  REFERRALS: 'referrals',
  DASHBOARD: 'dashboard',
  PRIME: 'prime',
  STREAM: 'stream',
  DRIVE: 'drive',
  LEGACY: 'legacy',
};

export const Dialog = {
  SETTINGS: 'settings',
  ADD_DEVICE: 'add-device',
  FILTER: 'filter',
};

const DEVICE_PAGES = [Page.PRIME, Page.STREAM];
const DIALOGS = Object.values(Dialog);

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const WHOLE_NUMBER = /^\d+$/;

// a range in milliseconds, or null if the URL parts aren't a valid range in `unit` milliseconds
function parseRange(start, end, unit) {
  if (!WHOLE_NUMBER.test(start) || !WHOLE_NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * unit, end: Number(end) * unit };
}

function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  if (first === Page.AUTH) return { page: Page.AUTH };
  if (parts.length === 1 && first === Page.REFERRALS) return { page: Page.REFERRALS };
  if (!DONGLE_ID.test(first)) return { page: Page.HOME };

  const dongleId = first;
  if (parts.length === 1) return { page: Page.DASHBOARD, dongleId };
  if (parts.length === 2 && DEVICE_PAGES.includes(second)) return { page: second, dongleId };
  if (LOG_ID.test(second) && (parts.length === 2 || parts.length === 4)) {
    return { page: Page.DRIVE, dongleId, logId: second, range: parseRange(third, fourth, 1000) };
  }
  if (parts.length === 3) {
    const range = parseRange(second, third, 1);
    if (range) return { page: Page.LEGACY, dongleId, range };
  }
  return { page: Page.HOME };
}

export function parseLocation({ pathname, search = '' }) {
  const dialog = new URLSearchParams(search).get('dialog');
  return {
    dongleId: null,
    logId: null,
    range: null,
    ...parsePath(pathname),
    dialog: DIALOGS.includes(dialog) ? dialog : null,
  };
}

// The inverse of parseLocation. Ranges round outwards so the URL always covers the selection.
export function urlFor({ page, dongleId = null, logId = null, range = null, dialog = null }) {
  let path;
  if (page === Page.REFERRALS) {
    path = `/${Page.REFERRALS}`;
  } else if (!dongleId) {
    path = '/';
  } else if (page === Page.DRIVE) {
    path = `/${dongleId}/${logId}`;
    if (range) path += `/${Math.floor(range.start / 1000)}/${Math.ceil(range.end / 1000)}`;
  } else if (DEVICE_PAGES.includes(page)) {
    path = `/${dongleId}/${page}`;
  } else {
    path = `/${dongleId}`;
  }
  return dialog ? `${path}?dialog=${dialog}` : path;
}

// the parsed URL of the store's current location
let lastLocation = null;
let lastParsed = null;
export function selectLocation(state) {
  const { location } = state.router;
  if (location !== lastLocation) {
    lastLocation = location;
    lastParsed = parseLocation(location);
  }
  return lastParsed;
}
