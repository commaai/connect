const DONGLE_RE = /^[0-9a-f]{16}$/;
const LOG_RE = /^\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}/;

function split(pathname) {
  return String(pathname || '').split('/').filter(Boolean);
}

function isDongle(segment) {
  return DONGLE_RE.test(segment || '');
}

function isLogId(segment) {
  return LOG_RE.test(segment || '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a connect pathname into a single structured route.
 *
 * Grammar (exact match, no prefixes):
 *   /                                   -> home
 *   /referrals                          -> referrals
 *   /:dongleId                          -> device
 *   /:dongleId/prime                    -> prime
 *   /:dongleId/stream                   -> stream
 *   /:dongleId/settings                 -> settings
 *   /:dongleId/:startMs/:endMs          -> legacy timestamp range
 *   /:dongleId/:logId                   -> drive
 *   /:dongleId/:logId/:startSec/:endSec -> drive zoom (seconds in URL, ms in state)
 */
export function parseUrl(pathname) {
  const parts = split(pathname);
  const empty = {
    dongleId: null, page: 'home', logId: null, start: null, end: null, legacy: null,
  };

  if (parts.length === 0) return { ...empty };
  if (parts.length === 1 && parts[0] === 'referrals') {
    return { ...empty, page: 'referrals' };
  }
  if (!isDongle(parts[0])) return { ...empty };

  const dongleId = parts[0];
  const rest = parts.slice(1);

  if (rest.length === 0) return { ...empty, dongleId, page: 'device' };
  if (rest.length === 1 && rest[0] === 'prime') return { ...empty, dongleId, page: 'prime' };
  if (rest.length === 1 && rest[0] === 'stream') return { ...empty, dongleId, page: 'stream' };
  if (rest.length === 1 && rest[0] === 'settings') return { ...empty, dongleId, page: 'settings' };

  if (rest.length === 1 && isLogId(rest[0])) {
    return { ...empty, dongleId, page: 'drive', logId: rest[0] };
  }

  if (rest.length === 3 && isLogId(rest[0])) {
    const start = toNumber(rest[1]);
    const end = toNumber(rest[2]);
    if (start !== null && end !== null && start >= 0 && end > start) {
      return { ...empty, dongleId, page: 'drive', logId: rest[0], start: start * 1000, end: end * 1000 };
    }
    return { ...empty, dongleId, page: 'drive', logId: rest[0] };
  }

  if (rest.length === 2) {
    const start = toNumber(rest[0]);
    const end = toNumber(rest[1]);
    if (start !== null && end !== null && start >= 0 && end > start) {
      return { ...empty, dongleId, page: 'device', legacy: { start, end } };
    }
  }

  return { ...empty, dongleId, page: 'device' };
}

export function urlFor({ dongleId = null, page = 'device', logId = null, start = null, end = null } = {}) {
  if (!dongleId) return page === 'referrals' ? '/referrals' : '/';
  if (page === 'prime') return `/${dongleId}/prime`;
  if (page === 'stream') return `/${dongleId}/stream`;
  if (page === 'settings') return `/${dongleId}/settings`;
  if (page === 'referrals') return '/referrals';
  if (logId) {
    if (start !== null && end !== null) {
      return `/${dongleId}/${logId}/${Math.floor(start / 1000)}/${Math.floor(end / 1000)}`;
    }
    return `/${dongleId}/${logId}`;
  }
  return `/${dongleId}`;
}

export const deviceUrl = (dongleId) => urlFor({ dongleId, page: 'device' });
export const driveUrl = (dongleId, logId, start = null, end = null) => urlFor({ dongleId, page: 'drive', logId, start, end });
export const settingsUrl = (dongleId) => urlFor({ dongleId, page: 'settings' });
export const primeUrl = (dongleId) => urlFor({ dongleId, page: 'prime' });
export const streamUrl = (dongleId) => urlFor({ dongleId, page: 'stream' });

/** Current top-level page for a pathname (used by Dashboard/explorer). */
export function currentPage(pathname) {
  return parseUrl(pathname).page;
}

// Back-compat wrappers (prefer parseUrl/urlFor in new code).
export function getDongleID(pathname) {
  return parseUrl(pathname).dongleId;
}

export function getRouteId(pathname) {
  return parseUrl(pathname).logId;
}

export function getRouteZoom(pathname) {
  const { start, end } = parseUrl(pathname);
  return start !== null && end !== null ? { start, end } : null;
}

export function getZoom(pathname) {
  const { legacy } = parseUrl(pathname);
  return legacy ? { ...legacy } : null;
}

export function getPrimeNav(pathname) {
  return parseUrl(pathname).page === 'prime';
}

export function getStreamNav(pathname) {
  return parseUrl(pathname).page === 'stream';
}
