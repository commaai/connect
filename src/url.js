import { DEMO_DONGLE_ID } from './api/demo';

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;

function range(start, end, scale = 1) {
  if (start == null || end == null || start.trim() === '' || end.trim() === '') return null;
  const values = [Number(start) * scale, Number(end) * scale];
  return values.every(Number.isFinite) && values[0] >= 0 && values[1] > values[0]
    ? { start: values[0], end: values[1] } : null;
}

// One pathname grammar shared by startup, authentication and history navigation.
export function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const base = { kind: 'unknown', dongleId: null, routeId: null, zoom: null, legacyZoom: null };
  if (!parts.length) return { ...base, kind: 'home' };
  if (parts[0] === 'auth') return { ...base, kind: 'auth' };
  if (parts.length === 1 && ['demo', 'referrals'].includes(parts[0])) {
    return { ...base, kind: parts[0], dongleId: parts[0] === 'demo' ? DEMO_DONGLE_ID : null };
  }
  const dongleId = parts[0];
  if (!dongleIdRegex.test(dongleId)) return base;
  const device = { ...base, dongleId };
  if (parts.length === 1) return { ...device, kind: 'dashboard' };
  if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
    return { ...device, kind: parts[1] };
  }
  if (logIdRegex.test(parts[1]) && [2, 4].includes(parts.length)) {
    const zoom = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
    return parts.length === 4 && !zoom ? base
      : { ...device, kind: 'drive', routeId: parts[1], zoom };
  }
  if (parts.length === 3) {
    const legacyZoom = range(parts[1], parts[2]);
    if (legacyZoom) return { ...device, kind: 'legacy', legacyZoom };
  }
  return base;
}

export function pathForRoute({ dongleId, routeId, start, end, page }) {
  if (!dongleId) return '/';
  const parts = [dongleId];
  if (routeId) {
    parts.push(routeId);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
      parts.push(start, end);
    }
  } else if (['prime', 'stream'].includes(page)) parts.push(page);
  return `/${parts.join('/')}`;
}

// Dialog URLs preserve the underlying page and unrelated query arguments.
export function settingsDevice(location) {
  const query = new URLSearchParams(location.search);
  const device = query.get('settings');
  return device && dongleIdRegex.test(device) ? device : null;
}

export function settingsLocation(location, dongleId) {
  const query = new URLSearchParams(location.search);
  if (dongleId) query.set('settings', dongleId);
  else query.delete('settings');
  const search = query.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash || '' };
}

export const getDongleID = (pathname) => parsePath(pathname).dongleId;
export const getZoom = (pathname) => parsePath(pathname).legacyZoom;
export const getRouteId = (pathname) => parsePath(pathname).routeId;
export const getRouteZoom = (pathname) => parsePath(pathname).zoom;
export const getPrimeNav = (pathname) => parsePath(pathname).kind === 'prime';
export const getStreamNav = (pathname) => parsePath(pathname).kind === 'stream';
