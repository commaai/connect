const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

const parts = (pathname) => pathname.split('/').filter(Boolean);

const isNumber = (value) => value !== '' && Number.isFinite(Number(value));

/**
 * URL destination grammar.
 *
 * Supported destinations:
 *   /                              -> home
 *   /:dongleId                     -> dashboard
 *   /:dongleId/prime               -> prime
 *   /:dongleId/stream              -> stream
 *   /:dongleId/:logId              -> drive
 *   /:dongleId/:logId/:start/:end  -> drive range
 *   /:dongleId/:start/:end         -> legacy timestamp range
 */
export function destinationFromUrl(pathname) {
  const path = parts(pathname);

  if (path.length === 0) {
    return { kind: 'home' };
  }

  const [dongleId, second, third, fourth] = path;

  if (!dongleIdRegex.test(dongleId)) {
    return { kind: 'unknown' };
  }

  if (path.length === 1) {
    return {
      kind: 'dashboard',
      dongleId,
    };
  }

  if (path.length === 2 && second === 'prime') {
    return {
      kind: 'prime',
      dongleId,
    };
  }

  if (path.length === 2 && second === 'stream') {
    return {
      kind: 'stream',
      dongleId,
    };
  }

  if (path.length === 2 && logIdRegex.test(second)) {
    return {
      kind: 'drive',
      dongleId,
      logId: second,
      start: null,
      end: null,
    };
  }

  // Legacy /:dongleId/:start/:end URL.
  if (path.length === 3 && isNumber(second) && isNumber(third)) {
    return {
      kind: 'legacy',
      dongleId,
      start: Number(second),
      end: Number(third),
    };
  }

  // Canonical /:dongleId/:logId/:start/:end URL.
  if (
    path.length === 4
    && logIdRegex.test(second)
    && isNumber(third)
    && isNumber(fourth)
  ) {
    return {
      kind: 'drive',
      dongleId,
      logId: second,
      start: Number(third),
      end: Number(fourth),
    };
  }

  return { kind: 'unknown' };
}

export function urlForDestination(destination) {
  switch (destination.kind) {
    case 'home':
      return '/';

    case 'dashboard':
      return `/${destination.dongleId}`;

    case 'prime':
      return `/${destination.dongleId}/prime`;

    case 'stream':
      return `/${destination.dongleId}/stream`;

    case 'drive': {
      const path = [destination.dongleId, destination.logId];

      if (destination.start != null && destination.end != null) {
        path.push(destination.start, destination.end);
      }

      return `/${path.join('/')}`;
    }

    case 'legacy':
      return `/${destination.dongleId}/${destination.start}/${destination.end}`;

    default:
      throw new Error(`Cannot build URL for destination: ${destination.kind}`);
  }
}

// ---------------------------------------------------------------------------
// Compatibility helpers.
// These remain temporarily so existing callers can migrate incrementally.
// ---------------------------------------------------------------------------

export function getDongleID(pathname) {
  const destination = destinationFromUrl(pathname);

  if (
    destination.kind === 'dashboard'
    || destination.kind === 'prime'
    || destination.kind === 'stream'
    || destination.kind === 'drive'
    || destination.kind === 'legacy'
  ) {
    return destination.dongleId;
  }

  return null;
}

export function getZoom(pathname) {
  const path = parts(pathname);

  if (path.length >= 3 && path[0] !== 'auth') {
    return {
      start: Number(path[1]),
      end: Number(path[2]),
    };
  }

  return null;
}

export function getRouteId(pathname) {
  const destination = destinationFromUrl(pathname);

  return destination.kind === 'drive' ? destination.logId : null;
}

export function getRouteZoom(pathname) {
  const destination = destinationFromUrl(pathname);

  if (
    destination.kind === 'drive'
    && destination.start != null
    && destination.end != null
  ) {
    return {
      start: destination.start * 1000,
      end: destination.end * 1000,
    };
  }

  return null;
}

export function getPrimeNav(pathname) {
  return destinationFromUrl(pathname).kind === 'prime';
}

export function getStreamNav(pathname) {
  return destinationFromUrl(pathname).kind === 'stream';
}
