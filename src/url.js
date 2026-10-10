// Pages: /, /referrals, /:dongleId, /:dongleId/prime, /:dongleId/stream,
// /:dongleId/:routeId[/:start/:end] (seconds), /:dongleId/:start/:end (legacy ms).
// Dialogs use ?dialog=<name> over the same page; ?device=<id> can target another device.
const DEVICE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const DIALOGS = ['settings', 'unpair', 'uploads', 'add-device', 'filter', 'account',
  'prime-cancel', 'prime-switch', 'files', 'info', 'clips', 'clip', 'delete-clip'];
const DEVICE_DIALOGS = ['settings', 'unpair', 'uploads'];
const DRIVE_DIALOGS = ['files', 'info'];
const CLIP_DIALOGS = ['clips', 'clip', 'delete-clip'];
const DIALOG_PARAMS = ['dialog', 'device', 'parent', 'clip'];

function parseRange(start, end, unit) {
  const number = unit === 1000 ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/;
  if (!number.test(start) || !number.test(end)) return null;
  const millis = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return unit === 1000 ? Number(whole) * 1000 + Number(fraction.padEnd(3, '0')) : Number(whole);
  };
  const range = { start: millis(start), end: millis(end) };
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.end > range.start ? range : null;
}

function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;
  if (pathname.startsWith('//') || pathname.includes('\\')) return { page: 'unknown' };
  if (!parts.length || pathname === '/demo') return { page: 'home' };
  if (parts.length === 1 && dongleId === 'auth') return { page: 'auth' };
  if (parts.length === 1 && dongleId === 'referrals') return { page: 'referrals' };
  if (!DEVICE_ID.test(dongleId)) return { page: 'unknown' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && ['prime', 'stream'].includes(branch)) return { page: branch, dongleId };
  if (ROUTE_ID.test(branch) && (parts.length === 2 || parts.length === 4)) {
    const range = parts.length === 4 ? parseRange(start, end, 1000) : null;
    if (parts.length === 2 || range) return { page: 'drive', dongleId, routeId: branch, range };
  }
  if (parts.length === 3) {
    const range = parseRange(branch, start, 1);
    if (range) return { page: 'legacy', dongleId, range };
  }
  return { page: 'unknown' };
}

export function parseLocation({ pathname = '/', search = '' }) {
  const destination = { dongleId: null, routeId: null, range: null, dialog: null,
    dialogDeviceId: null, parent: null, clip: null, ...parsePath(pathname) };
  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  const device = query.get('device');
  if (!DIALOGS.includes(dialog) || ['auth', 'unknown', 'stream'].includes(destination.page)) return destination;
  if (device && !DEVICE_ID.test(device)) return destination;
  if (DRIVE_DIALOGS.includes(dialog) && destination.page !== 'drive') return destination;
  if (CLIP_DIALOGS.includes(dialog) && !['dashboard', 'drive'].includes(destination.page)) return destination;
  if (['clip', 'delete-clip'].includes(dialog) && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.mp4$/.test(query.get('clip') || '')) return destination;
  if (['prime-cancel', 'prime-switch'].includes(dialog) && destination.page !== 'prime') return destination;
  if (dialog === 'filter' && !['home', 'dashboard'].includes(destination.page)) return destination;
  destination.dialog = dialog;
  destination.dialogDeviceId = DEVICE_DIALOGS.includes(dialog) ? device || destination.dongleId : null;
  destination.parent = ['settings', 'files', 'clips'].includes(query.get('parent')) ? query.get('parent') : null;
  destination.clip = ['clip', 'delete-clip'].includes(dialog) ? query.get('clip') : null;
  return destination;
}

export function buildLocation({ page = 'dashboard', dongleId, routeId, range, dialog, dialogDeviceId, parent, clip }, location = {}) {
  let pathname = '/';
  if (['referrals', 'auth'].includes(page)) pathname = `/${page}`;
  else if (dongleId) {
    pathname = `/${dongleId}`;
    if (page === 'drive') {
      pathname += `/${routeId}`;
      if (range) pathname += `/${range.start / 1000}/${range.end / 1000}`;
    } else if (page === 'legacy') pathname += `/${range.start}/${range.end}`;
    else if (['prime', 'stream'].includes(page)) pathname += `/${page}`;
  }
  const query = new URLSearchParams(location.search);
  DIALOG_PARAMS.forEach((key) => query.delete(key));
  if (dialog) {
    query.set('dialog', dialog);
    if (dialogDeviceId && dialogDeviceId !== dongleId) query.set('device', dialogDeviceId);
    if (parent) query.set('parent', parent);
    if (clip) query.set('clip', clip);
  }
  return { pathname, search: query.size ? `?${query}` : '', hash: location.hash || '' };
}

let selectedLocation;
let selectedDestination;
export function selectLocation(state) {
  if (state.router.location !== selectedLocation) {
    selectedLocation = state.router.location;
    selectedDestination = parseLocation(selectedLocation);
  }
  return selectedDestination;
}

export function parseRedirect(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const [pathname, search = ''] = value.split(/[?#]/);
  if (['unknown', 'auth'].includes(parseLocation({ pathname }).page) || new URLSearchParams(search).has('r')) return null;
  return value;
}
