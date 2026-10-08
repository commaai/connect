import { matchPath } from 'react-router-dom';

export const PAGES = {
  HOME: 'home', DASHBOARD: 'dashboard', DRIVE: 'drive', LEGACY: 'legacy',
  PRIME: 'prime', STREAM: 'stream', REFERRALS: 'referrals', NOT_FOUND: 'not-found',
};

export const DIALOGS = {
  SETTINGS: 'settings', UNPAIR: 'unpair', SETTINGS_UPLOADS: 'settings-uploads',
  ADD_DEVICE: 'add-device', FILTER: 'filter', UPLOADS: 'uploads',
  CANCEL_PRIME: 'cancel-prime', SWITCH_PRIME: 'switch-prime',
};
const SETTINGS_DIALOGS = [DIALOGS.SETTINGS, DIALOGS.UNPAIR, DIALOGS.SETTINGS_UPLOADS];
const DEVICE_ID = /^[a-f0-9]{16}$/;
const DONGLE_ID = ':dongleId([a-f0-9]{16})';
const LOG_ID = ':logId([a-f0-9-]{20})';

// Path -> page. Drive ranges use seconds; legacy timestamp ranges use milliseconds.
const ROUTES = [
  ['/', PAGES.HOME],
  ['/demo', PAGES.HOME],
  ['/referrals', PAGES.REFERRALS],
  [`/${DONGLE_ID}`, PAGES.DASHBOARD],
  [`/${DONGLE_ID}/prime`, PAGES.PRIME],
  [`/${DONGLE_ID}/stream`, PAGES.STREAM],
  [`/${DONGLE_ID}/${LOG_ID}`, PAGES.DRIVE],
  [`/${DONGLE_ID}/${LOG_ID}/:start/:end`, PAGES.DRIVE],
  [`/${DONGLE_ID}/:legacyStart(\\d+)/:legacyEnd(\\d+)`, PAGES.LEGACY],
];
const OVERLAY_PAGES = [PAGES.DASHBOARD, PAGES.DRIVE, PAGES.PRIME, PAGES.REFERRALS];
const DIALOG_PAGES = {
  [DIALOGS.SETTINGS]: OVERLAY_PAGES,
  [DIALOGS.UNPAIR]: OVERLAY_PAGES,
  [DIALOGS.SETTINGS_UPLOADS]: OVERLAY_PAGES,
  [DIALOGS.ADD_DEVICE]: [PAGES.HOME, ...OVERLAY_PAGES],
  [DIALOGS.FILTER]: [PAGES.DASHBOARD],
  [DIALOGS.UPLOADS]: [PAGES.DRIVE],
  [DIALOGS.CANCEL_PRIME]: [PAGES.PRIME],
  [DIALOGS.SWITCH_PRIME]: [PAGES.PRIME],
};

function range(start, end, scale) {
  if (start === undefined) return null;
  const pattern = scale === 1000 ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
  if (!pattern.test(start) || !pattern.test(end)) return null;
  const milliseconds = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * scale + (scale === 1000 ? Number(fraction.padEnd(3, '0')) : 0);
  };
  const a = milliseconds(start);
  const b = milliseconds(end);
  return Number.isSafeInteger(a) && Number.isSafeInteger(b) && a < b ? { start: a, end: b } : null;
}

export function parseUrl(pathname, search = '') {
  const empty = { dongleId: null, page: PAGES.NOT_FOUND, logId: null, zoom: null, legacyRange: null, dialog: null, dialogDevice: null };
  const route = ROUTES.map(([path, page]) => ({
    page, match: matchPath(pathname, { path, exact: true, sensitive: true }),
  })).find(({ match }) => match);
  if (!route) return empty;
  const { params } = route.match;
  const zoom = range(params.start, params.end, 1000);
  const legacyRange = range(params.legacyStart, params.legacyEnd, 1);
  if ((params.start !== undefined && !zoom) || (params.legacyStart !== undefined && !legacyRange)) return empty;
  const url = { ...empty, page: route.page, dongleId: params.dongleId ?? null, logId: params.logId ?? null, zoom, legacyRange };
  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  if (query.getAll('dialog').length === 1 && Object.hasOwn(DIALOG_PAGES, dialog) && DIALOG_PAGES[dialog].includes(url.page)) {
    const device = query.get('device') || url.dongleId;
    if (!SETTINGS_DIALOGS.includes(dialog) || (query.getAll('device').length <= 1 && DEVICE_ID.test(device))) {
      url.dialog = dialog;
      url.dialogDevice = SETTINGS_DIALOGS.includes(dialog) ? device : null;
    }
  }
  return url;
}

export function urlFor({ dongleId = null, page = null, logId = null, zoom = null }) {
  if (page === PAGES.REFERRALS) return '/referrals';
  if (!dongleId) return '/';
  const parts = [dongleId];
  if ([PAGES.PRIME, PAGES.STREAM].includes(page)) {
    parts.push(page);
  } else if (logId) {
    parts.push(logId);
    if (zoom) parts.push(Math.round(zoom.start) / 1000, Math.round(zoom.end) / 1000);
  }
  return `/${parts.join('/')}`;
}

// Dialog changes preserve the page, unrelated query arguments, and hash.
export function dialogUrl({ pathname, search = '', hash = '' }, dialog, device) {
  const query = new URLSearchParams(search);
  query.delete('dialog');
  query.delete('device');
  if (dialog) query.set('dialog', dialog);
  if (dialog && SETTINGS_DIALOGS.includes(dialog) && device) query.set('device', device);
  return `${pathname}${query.size ? `?${query}` : ''}${hash}`;
}

export function driveUrl({ dongleId, routes }, logId, zoom) {
  const route = routes?.find((candidate) => candidate.log_id === logId);
  const wholeDrive = zoom?.start == null || zoom?.end == null || (zoom.start === 0 && zoom.end === route?.duration);
  return urlFor({ dongleId, logId, zoom: wholeDrive ? null : zoom });
}

let lastLocation;
let lastUrl;
export function selectUrl(state) {
  const { location } = state.router;
  if (location !== lastLocation) {
    lastLocation = location;
    lastUrl = parseUrl(location.pathname, location.search);
  }
  return lastUrl;
}
