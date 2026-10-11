// Device pages and shared drives use paths; dialogs and date filters use queries.
const DEVICE = /^[a-f0-9]{16}$/;
const LOG = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const DECIMAL = /^\d+(?:\.\d{1,3})?$/;
export const dialogRules = {
  settings: { device: true },
  unpair: { device: true, parent: 'settings' },
  'settings-uploads': { device: true, parent: 'settings' },
  uploads: { device: true, parent: 'files' },
  clips: { device: true },
  clip: { device: true, clip: true, parent: 'clips' },
  'clip-delete': { device: true, clip: true, parent: 'clips' },
  'add-device': {},
  'pair-result': {},
  filter: { pages: ['dashboard', 'home', 'demo'] },
  'prime-cancel': { pages: ['prime'] },
  'prime-plan': { pages: ['prime'] },
  files: { pages: ['drive'] },
  info: { pages: ['drive'] },
};

function range(start, end, scale = 1) {
  const pattern = scale === 1000 ? DECIMAL : /^\d+$/;
  if (!pattern.test(start) || !pattern.test(end)) return null;
  const millis = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole + (scale === 1000 ? fraction.padEnd(3, '0') : ''));
  };
  const a = millis(start);
  const b = millis(end);
  return Number.isSafeInteger(a) && Number.isSafeInteger(b) && a < b
    && b <= (scale === 1 ? 8640000000000000 : Number.MAX_SAFE_INTEGER) ? { start: a, end: b } : null;
}

export function deviceUrl(dongleId, page = 'dashboard') {
  return dongleId ? `/${dongleId}${page === 'dashboard' ? '' : `/${page}`}` : '/';
}

export function withQuery(location, changes) {
  // Keep unrelated bytes, including signed parameters, repeated keys and flags.
  const kept = (location.search || '').replace(/^\?/, '').split('&').filter((part) => part
    && !Object.hasOwn(changes, new URLSearchParams(part).keys().next().value));
  const changed = new URLSearchParams();
  Object.entries(changes).forEach(([key, value]) => {
    if (value != null) changed.set(key, value);
  });
  const search = [...kept, changed.toString()].filter(Boolean).join('&');
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash || '' };
}

function seconds(millis) {
  if (!Number.isSafeInteger(millis) || millis < 0) throw new Error('Drive offsets must be safe integer milliseconds');
  const digits = String(millis).padStart(4, '0');
  const whole = digits.slice(0, -3);
  const fraction = digits.slice(-3).replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}

export function driveUrl(dongleId, logId, start = null, end = null) {
  const path = `${deviceUrl(dongleId)}/${logId}`;
  return start != null && end != null ? `${path}/${seconds(start)}/${seconds(end)}` : path;
}

function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const view = { page: 'home', dongleId: null, logId: null, range: null, legacyRange: null };
  let valid = ['/', '/demo', '/referrals', '/auth/', '/auth'].includes(pathname);
  if (pathname === '/demo') view.page = 'demo';
  if (pathname === '/referrals') view.page = 'referrals';
  if (pathname === '/auth/' || pathname === '/auth') view.page = 'auth';
  if (DEVICE.test(parts[0])) {
    view.dongleId = parts[0];
    view.page = 'dashboard';
    valid = parts.length === 1;
    if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
      view.page = parts[1]; valid = true;
    } else if (LOG.test(parts[1])) {
      view.logId = parts[1]; view.page = 'drive';
      view.range = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
      valid = parts.length === 2 || (parts.length === 3 && /^\d+$/.test(parts[2]))
        || (parts.length === 4 && Boolean(view.range));
      if (!valid) { view.logId = null; view.range = null; view.page = 'dashboard'; }
    } else if (parts.length === 3) {
      view.legacyRange = range(parts[1], parts[2]);
      valid = Boolean(view.legacyRange);
      if (valid) view.page = 'legacy';
    }
  }
  view.canonicalPath = valid ? pathname : deviceUrl(view.dongleId);
  return view;
}

export function parseLocation(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const view = { ...parsePath(pathname), dialog: null, dialogDevice: null, clip: null, filter: null };
  const query = new URLSearchParams(search);
  view.filter = range(query.get('from'), query.get('to'));
  const dialog = query.get('dialog') || (query.has('pair') ? 'pair-result' : null);
  const device = query.get('device') || view.dongleId;
  const clip = query.get('clip');
  const rule = Object.hasOwn(dialogRules, dialog) ? dialogRules[dialog] : null;
  const needsDevice = rule?.device;
  const needsClip = rule?.clip;
  const validClip = !needsClip || Boolean(clip && clip.length <= 255
    && !/[\\/]/.test(clip) && [...clip].every((c) => c.charCodeAt(0) > 31));
  const allowedOnPage = !['auth', 'stream'].includes(view.page)
    && (!rule?.pages || rule.pages.includes(view.page));
  if (rule && allowedOnPage && (!needsDevice || DEVICE.test(device)) && validClip) {
    view.dialog = dialog;
    view.dialogDevice = needsDevice ? device : null;
    view.clip = needsClip ? clip : null;
  }
  const removed = {};
  if (!view.filter) { removed.from = null; removed.to = null; }
  if (!view.dialog) removed.dialog = null;
  if (!view.dialogDevice) removed.device = null;
  if (!view.clip) removed.clip = null;
  view.canonicalSearch = withQuery({ pathname, search }, removed).search;
  return view;
}

export function dialogUrl(location, dialog, device = null, clip = null) {
  return withQuery(location, { dialog, device: device && device !== parseLocation(location).dongleId ? device : null, clip });
}

let cachedLocation;
let cachedView;

export function currentView(state) {
  const location = state.router.location;
  if (!cachedLocation
      || location.pathname !== cachedLocation.pathname
      || location.search !== cachedLocation.search) {
    cachedLocation = location;
    cachedView = parseLocation(location);
  }
  return cachedView;
}

export function appReturnUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && !url.pathname.startsWith('//')
      ? url.pathname + url.search + url.hash : null;
  } catch { return null; }
}

export const locationHref = (location) => location.pathname + (location.search || '') + (location.hash || '');
