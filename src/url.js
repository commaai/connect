// Paths: /, /demo, /referrals, /:device, /:device/prime, /:device/stream,
// /:device/:log[/:startSeconds/:endSeconds], /:device/:startMs/:endMs (legacy).
// Overlays: ?dialog=...&device=... . Query arguments and hashes survive navigation.
const DEVICE = /^[a-f0-9]{16}$/;
const LOG = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const NUMBER = /^\d+(?:\.\d+)?$/;
export const dialogs = new Set(['settings', 'unpair', 'settings-uploads', 'add-device', 'filter', 'uploads', 'cancel-prime', 'switch-plan']);

function range(start, end, scale = 1) {
  if (!NUMBER.test(start) || !NUMBER.test(end)) return null;
  const result = { start: Number(start) * scale, end: Number(end) * scale };
  return Number.isFinite(result.end) && result.start < result.end ? result : null;
}

export function parseLocation(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const parts = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(search);
  const view = { page: 'home', dongleId: null, logId: null, range: null, legacyRange: null, dialog: null, dialogDevice: null };
  if (pathname === '/demo') view.page = 'demo';
  else if (pathname === '/referrals') view.page = 'referrals';
  else if (DEVICE.test(parts[0])) {
    view.dongleId = parts[0];
    view.page = 'dashboard';
    if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) view.page = parts[1];
    else if (LOG.test(parts[1]) && (parts.length === 2 || parts.length === 4)) {
      const selection = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
      if (parts.length === 2 || selection) {
        view.page = 'drive';
        view.logId = parts[1];
        view.range = selection;
      }
    } else if (parts.length === 3) {
      view.legacyRange = range(parts[1], parts[2]);
      if (view.legacyRange) view.page = 'legacy';
    }
  }
  const dialog = query.get('dialog');
  if (dialogs.has(dialog)) {
    const device = query.get('device') || view.dongleId;
    const deviceDialog = ['settings', 'unpair', 'settings-uploads'].includes(dialog);
    const driveDialog = dialog === 'uploads';
    const primeDialog = ['cancel-prime', 'switch-plan'].includes(dialog);
    if ((!deviceDialog || DEVICE.test(device)) && (!driveDialog || view.page === 'drive')
        && (!primeDialog || view.page === 'prime')) {
      view.dialog = dialog;
      view.dialogDevice = deviceDialog ? device : null;
    }
  }
  return view;
}

export function deviceUrl(dongleId, page = 'dashboard') {
  return dongleId ? `/${dongleId}${page === 'dashboard' ? '' : `/${page}`}` : '/';
}

export function driveUrl(dongleId, logId, start = null, end = null) {
  const path = `${deviceUrl(dongleId)}/${logId}`;
  return start != null && end != null ? `${path}/${start / 1000}/${end / 1000}` : path;
}

export function dialogUrl(location, dialog, dongleId = null) {
  const query = new URLSearchParams(location.search);
  query.delete('dialog');
  query.delete('device');
  if (dialog) {
    query.set('dialog', dialog);
    if (dongleId) query.set('device', dongleId);
  }
  const search = query.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash || ''}`;
}

export const currentView = (state) => parseLocation(state.router?.location || window.location);
