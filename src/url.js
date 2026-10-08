const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const secondsRegex = /^\d+(?:\.\d{1,3})?$/;

// The URL owns page, device, drive range, and major modal selection. Redux
// contains their data/playback projections; form drafts and menu anchors stay local.
const modalPages = {
  settings: ['home', 'dashboard', 'drive'],
  uploads: ['home', 'dashboard', 'drive'],
  pair: ['home', 'dashboard', 'drive', 'prime', 'referrals'],
  filter: ['home', 'dashboard'],
  clips: ['home', 'dashboard', 'drive'],
};

function range(parts, multiplier) {
  if (parts.length !== 2 || !parts.every((part) => secondsRegex.test(part))) return null;
  const [start, end] = parts.map((part) => {
    if (multiplier === 1) return Number(part);
    const [whole, fraction = ''] = part.split('.');
    return Number(`${whole}${fraction.padEnd(3, '0')}`);
  });
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return null;
  return { start, end };
}

export function parseNavigation(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? (() => {
    const target = location.split('#')[0];
    const queryIndex = target.indexOf('?');
    return queryIndex < 0 ? { pathname: target, search: '' }
      : { pathname: target.slice(0, queryIndex), search: target.slice(queryIndex + 1) };
  })() : location;
  const parts = pathname.split('/').filter(Boolean);
  const navigation = { page: 'not-found', dongleId: null, logId: null, range: null, legacyRange: null, modal: null };
  if (!parts.length || pathname === '/demo') navigation.page = 'home';
  else if (parts.length === 1 && parts[0] === 'referrals') navigation.page = 'referrals';
  else if (parts[0] === 'auth') navigation.page = 'auth';
  else if (dongleIdRegex.test(parts[0])) {
    navigation.dongleId = parts[0];
    if (parts.length === 1) navigation.page = 'dashboard';
    else if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) navigation.page = parts[1];
    else if (logIdRegex.test(parts[1])) {
      navigation.page = 'drive';
      navigation.logId = parts[1];
      // A malformed/missing range means the entire valid drive, never NaN.
      navigation.range = range(parts.slice(2), 1000);
    } else if (parts.length === 3 && range(parts.slice(1), 1)) {
      navigation.page = 'legacy';
      navigation.legacyRange = range(parts.slice(1), 1);
    } else if (parts.length === 2 && ['settings', 'uploads'].includes(parts[1])) {
      // Readable aliases for direct entry; modal links retain their background URL.
      navigation.page = 'dashboard';
      navigation.modal = parts[1];
    }
  }
  const params = new URLSearchParams(search);
  const modals = params.getAll('modal');
  if (modals.length === 1 && modalPages[modals[0]]?.includes(navigation.page)) navigation.modal = modals[0];
  return navigation;
}

export function navigationForState(state) {
  return parseNavigation(state.router?.location || window.location);
}

export function drivePath(dongleId, logId, start = null, end = null) {
  const path = `/${dongleId}${logId ? `/${logId}` : ''}`;
  return logId && start != null && end != null ? `${path}/${start / 1000}/${end / 1000}` : path;
}

export function modalLocation(location, modal) {
  const params = new URLSearchParams(location.search);
  if (modal) params.set('modal', modal);
  else params.delete('modal');
  // Closing a direct path alias returns to its dashboard.
  const navigation = parseNavigation(location);
  const pathname = /\/(settings|uploads)\/?$/.test(location.pathname)
    ? `/${navigation.dongleId}` : location.pathname;
  return { ...location, pathname, search: params.toString() ? `?${params}` : '', hash: location.hash || '' };
}

// Compatibility helpers delegate to the single grammar, including auth startup.
export const getDongleID = (pathname) => parseNavigation(pathname).dongleId;
export const getZoom = (pathname) => parseNavigation(pathname).legacyRange;
export const getRouteId = (pathname) => parseNavigation(pathname).logId;
export const getRouteZoom = (pathname) => parseNavigation(pathname).range;
export const getPrimeNav = (pathname) => parseNavigation(pathname).page === 'prime';
export const getStreamNav = (pathname) => parseNavigation(pathname).page === 'stream';

// Authentication return targets must be supported local pages. One-shot feature
// payloads (OAuth, pairing, Stripe) remain owned and validated by those features.
export function safeReturnTo(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    && !target.includes('\\') && !['not-found', 'auth'].includes(parseNavigation(target).page) ? target : '/';
}
