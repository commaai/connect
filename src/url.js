// Supported paths (drive ranges are seconds; legacy ranges are timestamps in ms):
// /, /demo, /referrals, /pair, /:device, /:device/{prime,stream,settings,filter},
// /:device/settings/uploads, /:device/:log[/:start/:end], /:device/:startMs/:endMs
const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

function range(start, end, scale = 1) {
  if (!/^\d+(\.\d+)?$/.test(start) || !/^\d+(\.\d+)?$/.test(end)) return null;
  const bounds = { start: Number(start) * scale, end: Number(end) * scale };
  return Number.isFinite(bounds.end) && bounds.start < bounds.end ? bounds : null;
}

export function parseUrl(pathname) {
  const parts = (pathname.replace(/\/$/, '') || '/').split('/').slice(1);
  const empty = { page: 'notFound', dongleId: null, logId: null, zoom: null, legacyRange: null };
  if (parts.length === 1 && ['', 'demo', 'referrals', 'pair'].includes(parts[0])) {
    return { ...empty, page: parts[0] || 'home' };
  }
  const [dongleId, logId, start, end] = parts;
  if (!dongleIdRegex.test(dongleId)) return empty;
  if (parts.length === 1) return { ...empty, page: 'device', dongleId };
  if (parts.length === 2 && ['prime', 'stream', 'settings', 'filter'].includes(logId)) {
    return { ...empty, page: logId, dongleId };
  }
  if (parts.length === 3 && logId === 'settings' && start === 'uploads') {
    return { ...empty, page: 'uploads', dongleId };
  }
  if (logIdRegex.test(logId)) {
    if (parts.length === 2) return { ...empty, page: 'drive', dongleId, logId };
    const zoom = range(start, end, 1000);
    if (parts.length === 4 && zoom) return { ...empty, page: 'drive', dongleId, logId, zoom };
  }
  const legacyRange = range(logId, start);
  if (parts.length === 3 && legacyRange) return { ...empty, page: 'legacy', dongleId, legacyRange };
  return empty;
}

export function deviceUrl(dongleId, page = '') {
  return `/${dongleId}${page ? `/${page}` : ''}`;
}

export function driveUrl(dongleId, logId, zoom = null) {
  const path = `${deviceUrl(dongleId)}/${logId}`;
  return zoom ? `${path}/${zoom.start / 1000}/${zoom.end / 1000}` : path;
}

// Absolute milliseconds keep a shared filter independent of the viewer's timezone.
export function parseFilter(search = '') {
  const query = new URLSearchParams(search);
  if (query.getAll('from').length !== 1 || query.getAll('to').length !== 1) return null;
  const start = query.get('from');
  const end = query.get('to');
  if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) return null;
  const filter = { start: Number(start), end: Number(end) };
  return Number.isSafeInteger(filter.start) && Number.isSafeInteger(filter.end)
    && filter.start < filter.end && filter.end <= 8640000000000000 ? filter : null;
}

export function filterSearch(filter) {
  return filter ? `?from=${filter.start}&to=${filter.end}` : '';
}

// Dialogs keep the page underneath them, including the exact drive range.
const dialogPages = {
  uploads: ['drive'],
  'switch-plan': ['prime'],
  'cancel-prime': ['prime'],
  unpair: ['settings'],
};

export function getDialog({ pathname, search = '' }) {
  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  return query.getAll('dialog').length === 1 && Object.hasOwn(dialogPages, dialog)
    && dialogPages[dialog].includes(parseUrl(pathname).page) ? dialog : null;
}

export function dialogUrl(location, dialog) {
  const query = new URLSearchParams(location.search);
  query.delete('dialog');
  if (dialog) query.set('dialog', dialog);
  const search = query.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash || ''}`;
}

export const getDongleID = (pathname) => parseUrl(pathname).dongleId;
export const getZoom = (pathname) => parseUrl(pathname).legacyRange;
export const getRouteId = (pathname) => parseUrl(pathname).logId;
export const getRouteZoom = (pathname) => parseUrl(pathname).zoom;
export const getPrimeNav = (pathname) => parseUrl(pathname).page === 'prime';
export const getStreamNav = (pathname) => parseUrl(pathname).page === 'stream';
