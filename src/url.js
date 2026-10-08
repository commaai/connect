const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

// Split a pathname into its meaningful (non-empty) segments once.
function segments(pathname) {
  return pathname.split('/').filter((m) => m.length);
}

export function getDongleID(pathname) {
  const parts = segments(pathname);

  if (!dongleIdRegex.test(parts[0])) {
    return null;
  }

  return parts[0] || null;
}

export function getZoom(pathname) {
  const parts = segments(pathname);
  if (parts.length >= 3 && parts[0] !== 'auth') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getRouteId(pathname) {
  const parts = segments(pathname);

  if (parts.length >= 2 && logIdRegex.test(parts[1])) {
    return parts[1];
  }
  return null;
}

export function getRouteZoom(pathname) {
  const parts = segments(pathname);
  if (getRouteId(pathname) && parts.length >= 4) {
    return {
      start: Number(parts[2]) * 1000,
      end: Number(parts[3]) * 1000,
    };
  }
  return null;
}

export function getPrimeNav(pathname) {
  const parts = segments(pathname);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'prime') {
    return true;
  }
  return false;
}

export function getStreamNav(pathname) {
  const parts = segments(pathname);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'stream') {
    return true;
  }
  return false;
}

/**
 * Parse a URL pathname into the app's navigation state in one pass.
 *
 * This is the single, clear "url -> state" entry point: every initial value
 * (device, route, zoom, prime/stream nav) is derived from one split of the
 * pathname instead of being re-parsed separately by each getter.
 *
 * Shapes:
 *   /                                   -> { dongleId: null }
 *   /<dongle>                           -> { dongleId }
 *   /<dongle>/prime                     -> { dongleId, primeNav: true }
 *   /<dongle>/stream                    -> { dongleId, streamNav: true }
 *   /<dongle>/<routeId>                 -> { dongleId, routeId }
 *   /<dongle>/<routeId>/<start>/<end>   -> { dongleId, routeId, zoom: {start,end} }
 *
 * @param {string} pathname
 * @returns {{ dongleId: string|null, routeId: string|null, zoom: {start:number,end:number}|null, primeNav: boolean, streamNav: boolean }}
 */
export function parsePath(pathname) {
  const parts = segments(pathname);
  const hasDongle = dongleIdRegex.test(parts[0]);
  const dongleId = hasDongle ? (parts[0] || null) : null;

  const routeId = (parts.length >= 2 && logIdRegex.test(parts[1])) ? parts[1] : null;
  const zoom = (routeId && parts.length >= 4)
    ? { start: Number(parts[2]) * 1000, end: Number(parts[3]) * 1000 }
    : null;

  return {
    dongleId,
    routeId,
    zoom,
    primeNav: parts.length === 2 && hasDongle && parts[1] === 'prime',
    streamNav: parts.length === 2 && hasDongle && parts[1] === 'stream',
  };
}
