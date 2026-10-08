const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const SECONDS = /^\d+$/;

const rangeFromSeconds = (start, end) => {
  const startMillis = Number(start) * 1000;
  const endMillis = Number(end) * 1000;

  return Number.isSafeInteger(startMillis) && Number.isSafeInteger(endMillis) && endMillis > startMillis
    ? { start: startMillis, end: endMillis }
    : null;
};

// A location has one, explicit meaning. Components should not need to interpret
// path segments themselves; add new destinations here and in urlForDestination.
export function destinationFromUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, page, start, end] = parts;

  if (parts.length === 0) return { kind: 'root' };
  if (!DONGLE_ID.test(dongleId)) return { kind: 'not-found' };
  if (parts.length === 1) return { kind: 'dashboard', dongleId };
  if (parts.length === 2 && ['prime', 'stream', 'settings'].includes(page)) {
    return { kind: page, dongleId };
  }
  if (parts.length === 2 && LOG_ID.test(page)) {
    return { kind: 'drive', dongleId, logId: page, range: null };
  }
  if (parts.length === 4 && LOG_ID.test(page) && SECONDS.test(start) && SECONDS.test(end)) {
    const range = rangeFromSeconds(start, end);
    return range ? { kind: 'drive', dongleId, logId: page, range } : { kind: 'not-found' };
  }
  // Kept only to turn previously shared timestamp URLs into stable route URLs.
  if (parts.length === 3 && SECONDS.test(page) && SECONDS.test(start)) {
    const range = rangeFromSeconds(page, start);
    return range ? { kind: 'legacy-range', dongleId, range } : { kind: 'not-found' };
  }
  return { kind: 'not-found' };
}

export function urlForDestination(destination) {
  const { dongleId, kind, logId, range } = destination || {};
  if (!dongleId || !DONGLE_ID.test(dongleId)) return '/';
  if (kind === 'dashboard') return `/${dongleId}`;
  if (['prime', 'stream', 'settings'].includes(kind)) return `/${dongleId}/${kind}`;
  if (kind === 'drive' && LOG_ID.test(logId)) {
    const path = `/${dongleId}/${logId}`;
    return range ? `${path}/${Math.floor(range.start / 1000)}/${Math.floor(range.end / 1000)}` : path;
  }
  return '/';
}

// Compatibility helpers keep the rest of the application on one parser while
// destinations migrate to the explicit API above.
export function getDongleID(pathname) {
  return destinationFromUrl(pathname).dongleId || null;
}

export function getRouteId(pathname) {
  const destination = destinationFromUrl(pathname);
  return destination.kind === 'drive' ? destination.logId : null;
}

export function getRouteZoom(pathname) {
  const destination = destinationFromUrl(pathname);
  return destination.kind === 'drive' ? destination.range : null;
}

export function getZoom(pathname) {
  const destination = destinationFromUrl(pathname);
  return destination.kind === 'legacy-range'
    ? { start: destination.range.start / 1000, end: destination.range.end / 1000 }
    : null;
}

export function getPrimeNav(pathname) {
  return destinationFromUrl(pathname).kind === 'prime';
}

export function getStreamNav(pathname) {
  return destinationFromUrl(pathname).kind === 'stream';
}

export function getSettingsDeviceId(pathname) {
  const destination = destinationFromUrl(pathname);
  return destination.kind === 'settings' ? destination.dongleId : null;
}
