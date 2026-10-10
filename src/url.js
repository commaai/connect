export const ROUTES = Object.freeze({
  HOME: 'home', DEMO: 'demo', DEVICE: 'device', DRIVE: 'drive', LEGACY: 'legacy',
  SETTINGS: 'settings', PRIME: 'prime', STREAM: 'stream', REFERRALS: 'referrals', AUTH: 'auth',
});

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;

export function parseQuery(search = '') {
  return Object.fromEntries(new URLSearchParams(search));
}

function milliseconds(value, seconds = false) {
  if (!(seconds ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/).test(value)) return NaN;
  const [whole, fraction = ''] = value.split('.');
  return seconds ? Number(whole) * 1000 + Number(fraction.padEnd(3, '0')) : Number(whole);
}

// Drive range paths use seconds; Redux and legacy timestamp URLs use milliseconds.
export function parseRoute(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const parts = pathname.split('/').filter(Boolean);
  const query = parseQuery(search);
  const route = { type: null, dongleId: null, logId: null, zoom: null, query };
  const pages = { demo: ROUTES.DEMO, referrals: ROUTES.REFERRALS, auth: ROUTES.AUTH };
  if (!parts.length) return { ...route, type: ROUTES.HOME };
  if (parts.length === 1 && pages[parts[0]]) return { ...route, type: pages[parts[0]] };
  if (parts[0] === 'demo') parts[0] = 'deadbeefdeadbeef';
  if (!dongleIdRegex.test(parts[0])) return null;
  route.dongleId = parts[0];
  if (parts.length === 1) return { ...route, type: ROUTES.DEVICE };
  const devicePages = { settings: ROUTES.SETTINGS, prime: ROUTES.PRIME, stream: ROUTES.STREAM };
  if (parts.length === 2 && devicePages[parts[1]]) return { ...route, type: devicePages[parts[1]] };
  if (logIdRegex.test(parts[1])) {
    route.type = ROUTES.DRIVE;
    route.logId = parts[1];
    if (parts.length === 2) return route;
    if (parts.length !== 4) return null;
    route.zoom = { start: milliseconds(parts[2], true), end: milliseconds(parts[3], true) };
  } else if (parts.length === 3) {
    route.type = ROUTES.LEGACY;
    route.zoom = { start: milliseconds(parts[1]), end: milliseconds(parts[2]) };
  } else return null;
  const { start, end } = route.zoom;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start ? route : null;
}

function queryString(query) {
  const value = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString();
  return value ? `?${value}` : '';
}

export function buildUrl({ type = ROUTES.DEVICE, dongleId, logId, zoom, query = {} }) {
  const parts = dongleId ? [dongleId] : [];
  if (logId) {
    parts.push(logId);
    if (zoom) parts.push(zoom.start / 1000, zoom.end / 1000);
  } else if (type === ROUTES.LEGACY && zoom) parts.push(zoom.start, zoom.end);
  else if ([ROUTES.SETTINGS, ROUTES.PRIME, ROUTES.STREAM].includes(type)) parts.push(type);
  else if ([ROUTES.DEMO, ROUTES.REFERRALS, ROUTES.AUTH].includes(type)) return `/${type}${queryString(query)}`;
  return `/${parts.join('/')}${queryString(query)}`;
}
