const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

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

// ---------------------------------------------------------------------------
// Canonical URL grammar (Stage 1 of issue #770).
//
// This section is the single obvious home for what a connect URL means.
// The six helpers above are frozen legacy behavior and must not change in
// this stage; new code should use parsePath/buildPath.
//
// Supported pathname shapes (no trailing slash in canonical output,
// query strings and hashes are ignored by the parser and never emitted
// by the builder):
//
//   /                              root
//   /{dongle}                      device dashboard
//   /{dongle}/{log}                whole drive
//   /{dongle}/{log}/{start}/{end}  drive range, start/end are integer seconds
//   /{dongle}/{start}/{end}        legacy timestamp range (async route-id
//                                  resolution stays in middleware/thunks;
//                                  this parser only identifies the shape)
//   /{dongle}/prime                prime view
//   /{dongle}/stream               teleop view
//   /{dongle}/settings             device settings modal over the dashboard
//   /referrals                     referrals page
//   /demo                          demo entry point (/demo/... stays demo)
//   /auth...                        auth flow (not navigational)
//   anything else                  unknown
//
// Time convention: the URL carries whole integer seconds. Redux/playback
// state carries milliseconds. Use secToMs/msToSecFloor to convert and do
// not duplicate the factor 1000 anywhere else.
// ---------------------------------------------------------------------------

export const MS_PER_SEC = 1000;

export function secToMs(sec) {
  return sec * MS_PER_SEC;
}

export function msToSecFloor(ms) {
  return Math.floor(ms / MS_PER_SEC);
}

const CANONICAL_DONGLE_ID = /^[a-f0-9]{16}$/;
const CANONICAL_LOG_ID = /^[a-f0-9-]{20}$/;
const CANONICAL_SEC = /^\d+$/;

function isCanonicalDongleId(segment) {
  return typeof segment === 'string' && CANONICAL_DONGLE_ID.test(segment);
}

function isCanonicalLogId(segment) {
  return typeof segment === 'string' && CANONICAL_LOG_ID.test(segment);
}

function isCanonicalSec(segment) {
  return typeof segment === 'string' && CANONICAL_SEC.test(segment);
}

function withoutQueryAndHash(pathname) {
  if (typeof pathname !== 'string') {
    return pathname;
  }
  const queryIndex = pathname.indexOf('?');
  const hashIndex = pathname.indexOf('#');
  let end = pathname.length;
  if (queryIndex !== -1) {
    end = Math.min(end, queryIndex);
  }
  if (hashIndex !== -1) {
    end = Math.min(end, hashIndex);
  }
  return pathname.slice(0, end);
}

function splitCanonicalParts(pathname) {
  return withoutQueryAndHash(pathname).split('/').filter((part) => part.length);
}

function emptyParsed(kind) {
  return {
    kind,
    dongleId: null,
    logId: null,
    startSec: null,
    endSec: null,
  };
}

// Parse a pathname (query string and hash are tolerated and ignored) into
// the smallest representation that makes the grammar obvious. This function
// is synchronous and never fetches: the legacy range only names timestamps,
// middleware resolves it to a route id later.
export function parsePath(pathname) {
  const parts = splitCanonicalParts(pathname);

  if (parts.length === 0) {
    return emptyParsed('root');
  }

  const [first, second, third, fourth] = parts;

  if (first === 'referrals' && parts.length === 1) {
    return emptyParsed('referrals');
  }

  if (first === 'demo') {
    return emptyParsed('demo');
  }

  if (first === 'auth') {
    return emptyParsed('auth');
  }

  if (!isCanonicalDongleId(first)) {
    return emptyParsed('unknown');
  }

  if (parts.length === 1) {
    return {
      kind: 'dashboard',
      dongleId: first,
      logId: null,
      startSec: null,
      endSec: null,
    };
  }

  if (parts.length === 2) {
    if (second === 'prime') {
      return {
        kind: 'prime',
        dongleId: first,
        logId: null,
        startSec: null,
        endSec: null,
      };
    }
    if (second === 'stream') {
      return {
        kind: 'stream',
        dongleId: first,
        logId: null,
        startSec: null,
        endSec: null,
      };
    }
    if (second === 'settings') {
      return {
        kind: 'settings',
        dongleId: first,
        logId: null,
        startSec: null,
        endSec: null,
      };
    }
    if (isCanonicalLogId(second)) {
      return {
        kind: 'drive',
        dongleId: first,
        logId: second,
        startSec: null,
        endSec: null,
      };
    }
    return emptyParsed('unknown');
  }

  if (parts.length === 3) {
    if (isCanonicalSec(second) && isCanonicalSec(third)) {
      return {
        kind: 'legacyRange',
        dongleId: first,
        logId: null,
        startSec: Number(second),
        endSec: Number(third),
      };
    }
    return emptyParsed('unknown');
  }

  if (parts.length === 4) {
    if (isCanonicalLogId(second) && isCanonicalSec(third) && isCanonicalSec(fourth)) {
      return {
        kind: 'driveRange',
        dongleId: first,
        logId: second,
        startSec: Number(third),
        endSec: Number(fourth),
      };
    }
    return emptyParsed('unknown');
  }

  return emptyParsed('unknown');
}

function isValidDongleIdForBuild(dongleId) {
  return isCanonicalDongleId(dongleId);
}

function isValidLogIdForBuild(logId) {
  return isCanonicalLogId(logId);
}

function isValidSecForBuild(value) {
  return Number.isInteger(value) && value >= 0;
}

// Build the canonical pathname for a parsed representation. Returns null
// when the representation cannot produce a canonical path (unknown kind or
// missing/invalid fields). Never includes query strings, hashes, or a
// trailing slash (except the root "/"). A whole drive never gains range
// parameters.
export function buildPath(parsed) {
  if (!parsed || typeof parsed.kind !== 'string') {
    return null;
  }

  switch (parsed.kind) {
    case 'root':
      return '/';
    case 'referrals':
      return '/referrals';
    case 'demo':
      return '/demo';
    case 'auth':
      return '/auth/';
    case 'dashboard':
      if (!isValidDongleIdForBuild(parsed.dongleId)) {
        return null;
      }
      return `/${parsed.dongleId}`;
    case 'prime':
      if (!isValidDongleIdForBuild(parsed.dongleId)) {
        return null;
      }
      return `/${parsed.dongleId}/prime`;
    case 'stream':
      if (!isValidDongleIdForBuild(parsed.dongleId)) {
        return null;
      }
      return `/${parsed.dongleId}/stream`;
    case 'settings':
      if (!isValidDongleIdForBuild(parsed.dongleId)) {
        return null;
      }
      return `/${parsed.dongleId}/settings`;
    case 'drive':
      if (!isValidDongleIdForBuild(parsed.dongleId) || !isValidLogIdForBuild(parsed.logId)) {
        return null;
      }
      return `/${parsed.dongleId}/${parsed.logId}`;
    case 'driveRange':
      if (!isValidDongleIdForBuild(parsed.dongleId)
        || !isValidLogIdForBuild(parsed.logId)
        || !isValidSecForBuild(parsed.startSec)
        || !isValidSecForBuild(parsed.endSec)) {
        return null;
      }
      return `/${parsed.dongleId}/${parsed.logId}/${parsed.startSec}/${parsed.endSec}`;
    case 'legacyRange':
      if (!isValidDongleIdForBuild(parsed.dongleId)
        || !isValidSecForBuild(parsed.startSec)
        || !isValidSecForBuild(parsed.endSec)) {
        return null;
      }
      return `/${parsed.dongleId}/${parsed.startSec}/${parsed.endSec}`;
    default:
      return null;
  }
}
