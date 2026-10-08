// The URL contract. Ranges in application state are always milliseconds.
const DEVICE = /^[a-f0-9]{16}$/;
const DRIVE = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const PAGES = new Set(['prime', 'stream']);
export const DIALOGS = new Set(['settings', 'add-device', 'pair', 'clip', 'clips', 'uploads']);

function range(start, end, scale = 1) {
  if (start == null || end == null || start.trim() === '' || end.trim() === '') return null;
  const a = Number(start) * scale;
  const b = Number(end) * scale;
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a ? { start: a, end: b } : null;
}

export function parseUrl(location = '/') {
  const url = typeof location === 'string' ? new URL(location, 'https://connect.local') : location;
  const parts = url.pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(url.search);
  const route = { page: 'dashboard', dongleId: null, routeId: null, range: null, legacyRange: null, dialog: null, dialogDeviceId: null };
  const invalid = () => ({ ...route, page: 'not-found', routeId: null, range: null, dialog: null });

  if (parts[0] === 'auth') return { ...route, page: 'auth' };
  if (parts.length === 1 && parts[0] === 'referrals') route.page = 'referrals';
  else if (parts.length === 1 && parts[0] === 'demo') route.page = 'demo';
  else if (parts.length === 2 && parts[0] === 'devices' && ['add', 'pair'].includes(parts[1])) {
    route.dialog = parts[1] === 'add' ? 'add-device' : 'pair';
  } else if (parts.length) {
    if (!DEVICE.test(parts[0])) return invalid();
    route.dongleId = parts.shift();
    if (parts.length === 1 && PAGES.has(parts[0])) route.page = parts[0];
    else if (parts.length === 1 && parts[0] === 'settings') route.dialog = 'settings';
    else if (parts.length) {
      const explicit = parts[0] === 'drive';
      if (explicit) parts.shift();
      if (DRIVE.test(parts[0]) && [1, 3].includes(parts.length)) {
        route.page = 'drive';
        route.routeId = parts[0];
        if (parts.length === 3) {
          route.range = range(parts[1], parts[2], 1000);
          if (!route.range) return invalid();
        }
      } else if (!explicit && parts.length === 2 && range(...parts)) {
        route.legacyRange = range(...parts);
      } else return invalid();
    }
  }
  if (DIALOGS.has(query.get('dialog'))) route.dialog = query.get('dialog');
  if (query.has('pair')) route.dialog = 'pair';
  route.dialogDeviceId = DEVICE.test(query.get('device')) ? query.get('device') : route.dongleId;
  if (route.dialog === 'settings' && !route.dialogDeviceId) return invalid();
  if (route.dialog === 'clips' && (route.page !== 'dashboard' || !route.dongleId)) return invalid();
  if (route.dialog === 'clip' && route.page !== 'drive') return invalid();
  if (route.dialog === 'uploads' && !route.dongleId) return invalid();
  return route;
}

export function serializeUrl(route) {
  let path = route.dongleId ? `/${route.dongleId}` : '/';
  if (['referrals', 'demo'].includes(route.page)) path = `/${route.page}`;
  else if (route.page === 'drive') {
    path += `/drive/${route.routeId}`;
    if (route.range) path += `/${route.range.start / 1000}/${route.range.end / 1000}`;
  } else if (PAGES.has(route.page)) path += `/${route.page}`;
  else if (route.legacyRange) path += `/${route.legacyRange.start}/${route.legacyRange.end}`;
  const query = new URLSearchParams();
  if (route.dialog) {
    query.set('dialog', route.dialog);
    if (route.dialogDeviceId && route.dialogDeviceId !== route.dongleId) query.set('device', route.dialogDeviceId);
  }
  return path + (query.size ? `?${query}` : '');
}
