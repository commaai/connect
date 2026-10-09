// Path ranges are seconds relative to a drive; legacy ranges are UTC milliseconds.
// Dialogs are query parameters so opening one preserves the page underneath it.
const DEVICE_ID = /^[a-f0-9]{16}$/;
const DRIVE_ID = /^[a-f0-9-]{20}$/;
const DECIMAL = /^\d+(?:\.\d{1,3})?$/;
export const DEVICE_PAGES = ['prime', 'stream'];
export const DIALOGS = ['settings', 'settings-uploads', 'pair', 'filter', 'files', 'info', 'uploads', 'clips', 'clip', 'delete-clip', 'unpair', 'prime-switch', 'prime-cancel'];

export function locationPath({ pathname, search = '', hash = '' }) {
  return `${pathname}${search}${hash}`;
}

function readRange(start, end, scale) {
  if (!DECIMAL.test(start) || !DECIMAL.test(end)) return null;
  start = Math.round(Number(start) * scale);
  end = Math.round(Number(end) * scale);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end ? { start, end } : null;
}

export function parseLocation({ pathname = '/', search = '' }) {
  const parts = pathname.replace(/\/$/, '').split('/').slice(1);
  const [deviceId, driveId, start, end] = parts;
  const route = { page: 'home', dongleId: null, logId: null, range: null, legacyRange: null };
  if (pathname === '/referrals') route.page = 'referrals';
  else if (deviceId === 'demo' && parts.length === 1) route.page = 'demo';
  else if (DEVICE_ID.test(deviceId)) {
    route.dongleId = deviceId;
    route.page = 'dashboard';
    if (parts.length === 2 && DEVICE_PAGES.includes(driveId)) route.page = driveId;
    else if (DRIVE_ID.test(driveId) && (parts.length === 2 || parts.length === 4)) {
      route.page = 'drive';
      route.logId = driveId;
      route.range = parts.length === 4 ? readRange(start, end, 1000) : null;
    } else if (parts.length === 3) route.legacyRange = readRange(driveId, start, 1);
  }
  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  const settingsDevice = query.get('device') || route.dongleId;
  const driveDialog = ['files', 'info', 'uploads'].includes(dialog);
  const settingsDialog = ['settings', 'settings-uploads', 'unpair'].includes(dialog);
  const clipsDialog = ['clips', 'clip', 'delete-clip'].includes(dialog);
  const primeDialog = ['prime-switch', 'prime-cancel'].includes(dialog);
  route.dialog = DIALOGS.includes(dialog) && (!driveDialog || route.page === 'drive')
    && (!clipsDialog || ['dashboard', 'drive'].includes(route.page))
    && (!settingsDialog || DEVICE_ID.test(settingsDevice)) && (!primeDialog || route.page === 'prime') ? dialog : null;
  const filename = query.get('clip');
  route.clipFilename = ['clip', 'delete-clip'].includes(dialog) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(filename || '') ? filename : null;
  if (['clip', 'delete-clip'].includes(dialog) && !route.clipFilename) route.dialog = null;
  route.settingsDevice = settingsDialog && route.dialog ? settingsDevice : null;
  return route;
}

export function pathFor({ page = 'dashboard', dongleId, logId, range, legacyRange }) {
  if (page === 'referrals') return '/referrals';
  if (page === 'demo') return '/demo';
  if (!DEVICE_ID.test(dongleId)) return '/';
  const path = `/${dongleId}`;
  if (DEVICE_PAGES.includes(page)) return `${path}/${page}`;
  if (legacyRange) return `${path}/${legacyRange.start}/${legacyRange.end}`;
  if (page === 'drive' && DRIVE_ID.test(logId)) {
    return `${path}/${logId}${range ? `/${range.start / 1000}/${range.end / 1000}` : ''}`;
  }
  return path;
}

export function dialogLocation(location, dialog, device, clipFilename) {
  const query = new URLSearchParams(location.search);
  query.delete('dialog');
  query.delete('device');
  query.delete('clip');
  if (dialog) query.set('dialog', dialog);
  if (device) query.set('device', device);
  if (['clip', 'delete-clip'].includes(dialog) && clipFilename) query.set('clip', clipFilename);
  const search = query.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash || '' };
}

// The legacy sign-in continuation belongs only to the root callback URL.
export function authContinuation(location) {
  const target = location.pathname === '/' && new URLSearchParams(location.search).get('r');
  if (!target || !target.startsWith('/')) return null;
  try {
    const url = new URL(target, 'https://connect.local');
    return url.origin === 'https://connect.local' && !url.pathname.startsWith('//') ? locationPath(url) : null;
  } catch { return null; }
}
