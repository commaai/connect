const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

const validRange = (start, end) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end;

// Parses a pathname into everything the app needs to know about it.
//   routeId / range: /<dongleId>/<logId>[/<startSec>/<endSec>], range in route-relative ms
//   legacyRange:     /<dongleId>/<startMs>/<endMs>
//   prime / stream / settings: /<dongleId>/prime, /<dongleId>/stream, /<dongleId>/settings
export function destinationFromUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const dest = { dongleId: null, routeId: null, range: null, legacyRange: null, prime: false, stream: false, settings: false };
  if (!dongleIdRegex.test(parts[0])) {
    return dest;
  }

  dest.dongleId = parts[0];
  if (logIdRegex.test(parts[1])) {
    dest.routeId = parts[1];
    const [start, end] = [Number(parts[2]) * 1000, Number(parts[3]) * 1000];
    if (parts.length >= 4 && validRange(start, end)) {
      dest.range = { start, end };
    }
  } else if (parts.length >= 3) {
    const [start, end] = [Number(parts[1]), Number(parts[2])];
    if (validRange(start, end)) {
      dest.legacyRange = { start, end };
    }
  } else if (parts.length === 2) {
    dest.prime = parts[1] === 'prime';
    dest.stream = parts[1] === 'stream';
    dest.settings = parts[1] === 'settings';
  }
  return dest;
}

// Inverse of destinationFromUrl; range is in seconds.
export function urlForDestination({ dongleId, routeId, start, end, prime, stream, settings }) {
  const path = [dongleId];
  if (routeId) {
    path.push(routeId);
    if (start != null && end != null) {
      path.push(start, end);
    }
  } else if (prime) {
    path.push('prime');
  } else if (stream) {
    path.push('stream');
  } else if (settings) {
    path.push('settings');
  }
  return `/${path.join('/')}`;
}
