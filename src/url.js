const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const integerRegex = /^\d+$/;

const partsFor = (pathname) => pathname.split('/').filter(Boolean);
const isDongleId = (value) => dongleIdRegex.test(value || '');
const isLogId = (value) => logIdRegex.test(value || '');
const isInteger = (value) => integerRegex.test(value || '');

/**
 * Parse every location connect owns into a small, serializable route descriptor.
 * It is independent from Redux so direct loads, Back/Forward and in-app
 * navigation all use exactly the same interpretation.
 */
export function parseLocation(pathname) {
  const parts = partsFor(pathname);
  if (parts.length === 0) return { view: 'home' };
  if (parts.length === 1 && parts[0] === 'referrals') return { view: 'referrals' };

  const [dongleId, second, third] = parts;
  if (!isDongleId(dongleId)) return { view: 'unknown' };
  if (parts.length === 1) return { view: 'device', dongleId };
  if (second === 'prime' && parts.length === 2) return { view: 'prime', dongleId };
  if (second === 'stream' && parts.length === 2) return { view: 'stream', dongleId };
  if (second === 'settings' && parts.length <= 3) {
    if (parts.length === 2) return { view: 'settings', dongleId, panel: null };
    if (third === 'uploads') return { view: 'settings', dongleId, panel: 'uploads' };
    return { view: 'unknown' };
  }

  // Keep the established shared-link shape, while accepting a /drive/ prefix
  // for a future migration without creating a second parser.
  const routeOffset = second === 'drive' ? 2 : 1;
  const logId = parts[routeOffset];
  const start = parts[routeOffset + 1];
  const end = parts[routeOffset + 2];
  const expectedParts = routeOffset + (start === undefined ? 1 : 3);
  if (isLogId(logId) && parts.length === expectedParts && (start === undefined || (isInteger(start) && isInteger(end)))) {
    return {
      view: 'drive',
      dongleId,
      logId,
      startMs: start === undefined ? null : Number(start) * 1000,
      endMs: end === undefined ? null : Number(end) * 1000,
    };
  }

  // Timestamp-only links predate route IDs. History middleware resolves a
  // matching route before touching playback, so existing links keep working.
  if (parts.length === 3 && isInteger(second) && isInteger(third)) {
    return { view: 'legacy-range', dongleId, start: Number(second), end: Number(third) };
  }
  return { view: 'unknown' };
}

/** Serialize an internal destination. Invalid descriptors fail closed at /. */
export function urlForLocation(location) {
  if (!location || location.view === 'home') return '/';
  if (location.view === 'referrals') return '/referrals';
  // Parsing public input is strict. Serializing an internal destination stays
  // permissive so test/dev backends can use their non-production device ids.
  if (!location.dongleId) return '/';

  const root = `/${location.dongleId}`;
  if (location.view === 'device') return root;
  if (location.view === 'prime') return `${root}/prime`;
  if (location.view === 'stream') return `${root}/stream`;
  if (location.view === 'settings') return location.panel === 'uploads' ? `${root}/settings/uploads` : `${root}/settings`;
  if (location.view === 'drive' && location.logId) {
    if (Number.isFinite(location.startMs) && Number.isFinite(location.endMs)) {
      return `${root}/${location.logId}/${Math.floor(location.startMs / 1000)}/${Math.floor(location.endMs / 1000)}`;
    }
    return `${root}/${location.logId}`;
  }
  return root;
}

export function getDongleID(pathname) {
  return parseLocation(pathname).dongleId || null;
}

export function getZoom(pathname) {
  const parsed = parseLocation(pathname);
  return parsed.view === 'legacy-range' ? { start: parsed.start, end: parsed.end } : null;
}

export function getRouteId(pathname) {
  const parsed = parseLocation(pathname);
  return parsed.view === 'drive' ? parsed.logId : null;
}

export function getRouteZoom(pathname) {
  const parsed = parseLocation(pathname);
  if (parsed.view === 'drive' && parsed.startMs !== null && parsed.endMs !== null) {
    return { start: parsed.startMs, end: parsed.endMs };
  }
  return null;
}

export function getPrimeNav(pathname) {
  return parseLocation(pathname).view === 'prime';
}

export function getStreamNav(pathname) {
  return parseLocation(pathname).view === 'stream';
}
