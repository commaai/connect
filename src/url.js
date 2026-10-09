// every url connect understands. parseUrl reads one, buildUrl writes one.
//
//   /                                dashboard of the last used device
//   /referrals
//   /:dongleId                       dashboard
//   /:dongleId/prime
//   /:dongleId/stream
//   /:dongleId/:logId                drive
//   /:dongleId/:logId/:start/:end    drive, zoomed to a range in seconds
//   /:dongleId/:start/:end           old drive link in epoch milliseconds, only ever read
//   ?settings=:dongleId              device settings, on top of any page

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;

function parseRange(start, end, toMillis) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * toMillis, end: Number(end) * toMillis };
}

function parsePath(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals') {
    return { page: 'referrals' };
  }
  if (!DONGLE_ID.test(first)) {
    return { page: 'dashboard' };
  }
  const dongleId = first;
  if (second === 'prime' || second === 'stream') {
    return { page: second, dongleId };
  }
  if (LOG_ID.test(second)) {
    return { page: 'drive', dongleId, logId: second, ...parseRange(third, fourth, 1000) };
  }
  const legacy = parseRange(second, third, 1);
  if (legacy) {
    return { page: 'legacy', dongleId, ...legacy };
  }
  return { page: 'dashboard', dongleId };
}

export function parseUrl({ pathname, search = '' }) {
  const settings = new URLSearchParams(search).get('settings');
  return { ...parsePath(pathname), settings: DONGLE_ID.test(settings) ? settings : null };
}

export function buildUrl({ page, dongleId, logId, start, end, settings }) {
  const path = [];
  if (page === 'referrals') {
    path.push(page);
  } else if (dongleId) {
    path.push(dongleId);
    if (page === 'prime' || page === 'stream') {
      path.push(page);
    } else if (page === 'drive') {
      path.push(logId);
      if (start != null && end != null) {
        // whole seconds, and never an empty range
        const from = Math.floor(start / 1000);
        path.push(from, Math.max(Math.floor(end / 1000), from + 1));
      }
    }
  }
  return `/${path.join('/')}${settings ? `?settings=${settings}` : ''}`;
}

// a drive can be opened by anyone it was shared with, every other page needs an account
export function isPublic({ page }) {
  return page === 'drive' || page === 'legacy';
}
