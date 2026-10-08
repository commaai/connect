// The one place that knows how a connect URL maps to a destination and back.
//
// Route tree:
//   /
//   /referrals
//   /:dongleId
//   /:dongleId/settings
//   /:dongleId/prime
//   /:dongleId/stream
//   /:dongleId/:logId
//   /:dongleId/:logId/:start/:end   (seconds since the start of the drive)
//   /:dongleId/:legacyStart/:legacyEnd   (absolute unix milliseconds, migrated on load)
//
// `destinationFromUrl` and `urlForDestination` are pure and are exact inverses
// for every canonical URL the app produces. Anything unrecognized parses to
// `{ kind: 'not-found' }` instead of being partially interpreted, so a bad link
// can never drive the app into an inconsistent state.

const exactDongleIdRegex = /^[a-f0-9]{16}$/;
// Real route log ids ("2026-08-06--12-00-00") and demo log ids
// ("00000000--0000000001") both contain dashes; require one so a bare 20-digit
// string is never mistaken for a route id.
const routeLogIdRegex = /^[a-f0-9-]{20}$/;
const secondsRegex = /^\d+$/;

const isRouteLogId = (segment) => routeLogIdRegex.test(segment) && segment.includes('-');

// Seconds -> milliseconds, rejecting anything that is not a safe, positive span.
const rangeFromSeconds = (start, end) => {
  const startMillis = Number(start) * 1000;
  const endMillis = Number(end) * 1000;
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) {
    return null;
  }
  return { start: startMillis, end: endMillis };
};

// Absolute unix milliseconds, same validation as above.
const rangeFromMilliseconds = (start, end) => {
  const startMillis = Number(start);
  const endMillis = Number(end);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) {
    return null;
  }
  return { start: startMillis, end: endMillis };
};

/**
 * Parse a pathname into a destination. Pure; never throws.
 *
 * @param {string} pathname
 * @returns {{kind: 'root'|'not-found'|'referrals'|'dashboard'
 *   |'settings'|'prime'|'stream'|'drive'|'legacy', dongleId?: string,
 *   logId?: string, start?: number, end?: number}}
 */
export function destinationFromUrl(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);

  if (parts.length === 0) {
    return { kind: 'root' };
  }
  if (parts.length === 1 && parts[0] === 'referrals') {
    return { kind: 'referrals' };
  }
  if (parts.length === 1 && parts[0] === 'demo') {
    return { kind: 'demo' };
  }

  const [dongleId, branch, start, end] = parts;
  if (!exactDongleIdRegex.test(dongleId)) {
    return { kind: 'not-found' };
  }
  if (parts.length === 1) {
    return { kind: 'dashboard', dongleId };
  }
  if (parts.length === 2 && branch === 'settings') {
    return { kind: 'settings', dongleId };
  }
  if (parts.length === 2 && branch === 'prime') {
    return { kind: 'prime', dongleId };
  }
  if (parts.length === 2 && branch === 'stream') {
    return { kind: 'stream', dongleId };
  }
  if (parts.length === 2 && isRouteLogId(branch)) {
    return { kind: 'drive', dongleId, logId: branch, start: null, end: null };
  }
  if (parts.length === 4 && isRouteLogId(branch) && secondsRegex.test(start) && secondsRegex.test(end)) {
    const range = rangeFromSeconds(start, end);
    if (range) {
      return { kind: 'drive', dongleId, logId: branch, ...range };
    }
  }
  if (parts.length === 3 && secondsRegex.test(branch) && secondsRegex.test(start)) {
    const range = rangeFromMilliseconds(branch, start);
    if (range) {
      return { kind: 'legacy', dongleId, ...range };
    }
  }
  return { kind: 'not-found' };
}

/**
 * Format a destination into a canonical pathname. Pure.
 *
 * A drive range is emitted whenever both bounds are present; the caller decides
 * whether a selection is "the whole drive" and should use a range-less URL.
 *
 * @param {object} destination
 * @returns {string}
 */
export function urlForDestination(destination) {
  if (!destination) {
    return '/';
  }
  if (destination.kind === 'referrals') {
    return '/referrals';
  }
  if (destination.kind === 'demo') {
    return '/demo';
  }

  const { dongleId } = destination;
  if (!dongleId) {
    return '/';
  }
  if (destination.kind === 'settings') {
    return `/${dongleId}/settings`;
  }
  if (destination.kind === 'prime') {
    return `/${dongleId}/prime`;
  }
  if (destination.kind === 'stream') {
    return `/${dongleId}/stream`;
  }
  if (destination.kind === 'legacy' && destination.start != null && destination.end != null) {
    return `/${dongleId}/${destination.start}/${destination.end}`;
  }
  if (destination.kind === 'drive' && destination.logId) {
    const path = [dongleId, destination.logId];
    if (destination.start != null && destination.end != null) {
      path.push(Math.floor(destination.start / 1000), Math.floor(destination.end / 1000));
    }
    return `/${path.join('/')}`;
  }
  return `/${dongleId}`;
}

/**
 * Validate a `?r=` redirect target: only same-origin absolute paths are allowed,
 * so a crafted link can never send the SPA off-site (or crash `history`).
 *
 * @param {*} value
 * @returns {string|null}
 */
export function safeInternalPath(value) {
  if (typeof value !== 'string' || value[0] !== '/' || value[1] === '/' || value[1] === '\\') {
    return null;
  }
  // Control characters (tab/newline/NUL) are stripped by URL parsers, so a
  // value like "/\t/evil.example" would become protocol-relative. Reject them.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return null;
    }
  }
  return value;
}
