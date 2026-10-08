const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const dialogs = new Set(['settings', 'pair', 'filter', 'uploads', 'cancel-prime', 'switch-plan']);

function parseRange(start, end, scale = 1) {
  if (start == null || end == null || !start.trim() || !end.trim()) return null;
  start = Number(start) * scale;
  end = Number(end) * scale;
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
    ? { start, end } : null;
}

// Path selects the page; query parameters select an overlay without replacing it.
export function parseLocation({ pathname = '/', search = '' } = {}) {
  const parts = pathname.split('/').filter(Boolean);
  const result = {
    page: 'unknown', dongleId: null, routeId: null, range: null,
    legacyRange: null, dialog: null, dialogDevice: null,
  };
  if (parts.length === 0 || pathname === '/demo') result.page = 'dashboard';
  else if (pathname === '/referrals') result.page = 'referrals';
  else if (parts[0] === 'auth') result.page = 'auth';
  else if (dongleIdRegex.test(parts[0])) {
    result.dongleId = parts[0];
    if (parts.length === 1) result.page = 'dashboard';
    else if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) result.page = parts[1];
    else if ([2, 4].includes(parts.length) && logIdRegex.test(parts[1])) {
      result.range = parts.length === 4 ? parseRange(parts[2], parts[3], 1000) : null;
      if (parts.length === 2 || result.range) {
        result.page = 'drive';
        result.routeId = parts[1];
      }
    } else if (parts.length === 3) {
      result.legacyRange = parseRange(parts[1], parts[2]);
      if (result.legacyRange) result.page = 'legacy';
    }
  }
  const query = new URLSearchParams(search);
  if (result.page !== 'unknown' && result.page !== 'auth' && dialogs.has(query.get('dialog'))) {
    result.dialog = query.get('dialog');
    result.dialogDevice = query.get('device') || result.dongleId;
    if (result.dialog === 'settings' && !dongleIdRegex.test(result.dialogDevice)) result.dialog = null;
    if (['cancel-prime', 'switch-plan'].includes(result.dialog) && result.page !== 'prime') result.dialog = null;
    if (result.dialog === 'filter' && result.page !== 'dashboard') result.dialog = null;
    if (result.dialog === 'uploads' && !dongleIdRegex.test(result.dialogDevice)) result.dialog = null;
  }
  return result;
}

export const devicePath = (dongleId) => dongleId ? `/${dongleId}` : '/';

export function routePath(dongleId, routeId, start, end) {
  if (!routeId) return devicePath(dongleId);
  const path = `${devicePath(dongleId)}/${routeId}`;
  return start != null && end != null ? `${path}/${start}/${end}` : path;
}

export function dialogLocation(location, dialog, device) {
  const query = new URLSearchParams(location.search);
  query.delete('dialog');
  query.delete('device');
  if (dialog) query.set('dialog', dialog);
  if (dialog && device) query.set('device', device);
  const search = query.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
}

export const getDongleID = (pathname) => parseLocation({ pathname }).dongleId;
export const getZoom = (pathname) => parseLocation({ pathname }).legacyRange;
export const getRouteId = (pathname) => parseLocation({ pathname }).routeId;
export const getRouteZoom = (pathname) => parseLocation({ pathname }).range;
export const getPrimeNav = (pathname) => parseLocation({ pathname }).page === 'prime';
export const getStreamNav = (pathname) => parseLocation({ pathname }).page === 'stream';
