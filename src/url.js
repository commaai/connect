const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

// connect URLs:
//   /                                      home: no device chosen yet
//   /referrals
//   /auth/...                              login callback, handled by App
//   /:dongleId                             dashboard
//   /:dongleId/prime
//   /:dongleId/stream
//   /:dongleId/:logId[/:startSec/:endSec]  drive, range relative to the drive start
//   /:dongleId/:startMs/:endMs             legacy link, range in absolute timestamps
//   ?settings=:dongleId                    device settings over any page
const DONGLE_ID = /^[0-9a-f]{16}$/;
const LOG_ID = /^[0-9a-f-]{20}$/;
const INT = /^\d+$/;

function isRange(start, end) {
  return INT.test(start) && INT.test(end) && Number(start) < Number(end);
}

// Reads the longest valid prefix of the URL, so every pathname maps to a page.
export function parseLocation({ pathname, search }) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);
  const settings = new URLSearchParams(search).get('settings');
  const location = {
    page: 'home',
    dongleId: null,
    logId: null,
    range: null,
    settingsDongleId: DONGLE_ID.test(settings) ? settings : null,
  };

  if (first === 'auth' || first === 'referrals') {
    return { ...location, page: first };
  }
  if (!DONGLE_ID.test(first)) {
    return location;
  }
  const dongleId = first;
  if (second === 'prime' || second === 'stream') {
    return { ...location, page: second, dongleId };
  }
  if (LOG_ID.test(second)) {
    const range = isRange(third, fourth) ? { start: third * 1000, end: fourth * 1000 } : null;
    return { ...location, page: 'drive', dongleId, logId: second, range };
  }
  if (isRange(second, third)) {
    return { ...location, page: 'legacy', dongleId, range: { start: Number(second), end: Number(third) } };
  }
  return { ...location, page: 'dashboard', dongleId };
}

// The canonical URL for a location. Legacy and auth URLs are never built.
export function urlFor({ page, dongleId, logId, range, settingsDongleId }) {
  let pathname = '/';
  if (page === 'referrals') {
    pathname = '/referrals';
  } else if (page === 'dashboard') {
    pathname = `/${dongleId}`;
  } else if (page === 'prime' || page === 'stream') {
    pathname = `/${dongleId}/${page}`;
  } else if (page === 'drive') {
    pathname = range
      ? `/${dongleId}/${logId}/${Math.floor(range.start / 1000)}/${Math.ceil(range.end / 1000)}`
      : `/${dongleId}/${logId}`;
  }
  return settingsDongleId ? `${pathname}?settings=${settingsDongleId}` : pathname;
}

export function getDongleID(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (!dongleIdRegex.test(parts[0])) {
    return null;
  }

  return parts[0] || null;
}

export function getZoom(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);
  if (parts.length >= 3 && parts[0] !== 'auth') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getRouteId(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 2 && logIdRegex.test(parts[1])) {
    return parts[1];
  }
  return null;
}

export function getRouteZoom(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (getRouteId(pathname) && parts.length >= 4) {
    return {
      start: Number(parts[2]) * 1000,
      end: Number(parts[3]) * 1000,
    };
  }
  return null;
}

export function getPrimeNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'prime') {
    return true;
  }
  return false;
}

export function getStreamNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'stream') {
    return true;
  }
  return false;
}
