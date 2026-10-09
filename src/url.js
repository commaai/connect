const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

export const DIALOGS = new Set([
  'settings', 'unpair', 'uploads', 'pair', 'date-range', 'account',
  'cancel-subscription', 'change-plan', 'downloads', 'info', 'clips', 'clip-preview', 'clip-delete',
]);

function parseRange(start, end, multiplier = 1) {
  const pattern = multiplier === 1000 ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
  if (!pattern.test(start) || !pattern.test(end)) return null;
  const parseTime = (value) => {
    const [seconds, fraction = ''] = value.split('.');
    return multiplier === 1000 ? Number(seconds) * 1000 + Number(fraction.padEnd(3, '0')) : Number(value);
  };
  const range = { start: parseTime(start), end: parseTime(end) };
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.end > range.start ? range : null;
}

export function parseLocation({ pathname = '/', search = '' } = {}) {
  const parts = pathname.split('/').filter(Boolean);
  const navigation = {
    page: 'unknown', dongleId: null, routeId: null, routeZoom: null, legacyZoom: null,
    primeNav: false, streamNav: false, dialog: null, settingsDongleId: null, clipFilename: null,
  };

  if (!parts.length || (parts.length === 1 && parts[0] === 'demo')) navigation.page = 'dashboard';
  else if (parts[0] === 'auth') navigation.page = 'auth';
  else if (parts.length === 1 && parts[0] === 'referrals') navigation.page = 'referrals';
  else if (dongleIdRegex.test(parts[0])) {
    const [, destination, start, end] = parts;
    if (parts.length === 1) navigation.page = 'dashboard';
    else if (parts.length === 2 && ['prime', 'stream'].includes(destination)) {
      navigation.page = destination;
    } else if (logIdRegex.test(destination) && (parts.length === 2 || parts.length === 4)) {
      const range = parts.length === 4 ? parseRange(start, end, 1000) : null;
      if (parts.length === 2 || range) {
        navigation.page = 'drive';
        navigation.routeId = destination;
        navigation.routeZoom = range;
      }
    } else if (parts.length === 3) {
      const range = parseRange(destination, start);
      if (range) {
        navigation.page = 'drive';
        navigation.legacyZoom = range;
      }
    }
    if (navigation.page !== 'unknown') navigation.dongleId = parts[0];
  }

  navigation.primeNav = navigation.page === 'prime';
  navigation.streamNav = navigation.page === 'stream';
  const params = new URLSearchParams(search);
  const dialog = params.get('dialog');
  if (!['unknown', 'auth', 'stream'].includes(navigation.page) && DIALOGS.has(dialog)) {
    const primeDialog = ['cancel-subscription', 'change-plan'].includes(dialog);
    const driveDialog = ['downloads', 'info', 'clips', 'clip-preview', 'clip-delete'].includes(dialog);
    const deviceDialog = ['settings', 'unpair', 'uploads', 'date-range'].includes(dialog);
    const settingsDevice = params.get('settingsDevice');
    if ((!primeDialog || navigation.primeNav) && (!driveDialog || navigation.routeId)
      && (dialog !== 'date-range' || navigation.page === 'dashboard')
      && (!deviceDialog || navigation.dongleId || dongleIdRegex.test(settingsDevice))) {
      navigation.dialog = dialog;
      if (['clip-preview', 'clip-delete'].includes(dialog)) navigation.clipFilename = params.get('clip') || null;
      navigation.settingsDongleId = ['settings', 'unpair', 'uploads'].includes(dialog)
        && dongleIdRegex.test(settingsDevice) ? settingsDevice : null;
      if (dialog === 'uploads' && navigation.page !== 'drive' && !navigation.settingsDongleId) {
        navigation.settingsDongleId = navigation.dongleId;
      }
    }
  }
  return navigation;
}

export function formatDevicePath({ dongleId, routeId = null, routeZoom = null, page = 'dashboard' }) {
  const parts = dongleId ? [dongleId] : [];
  if (routeId) {
    parts.push(routeId);
    if (routeZoom) parts.push(routeZoom.start, routeZoom.end);
  } else if (['prime', 'stream'].includes(page)) parts.push(page);
  return `/${parts.join('/')}`;
}

export const getDongleID = (pathname) => parseLocation({ pathname }).dongleId;
export const getZoom = (pathname) => parseLocation({ pathname }).legacyZoom;
export const getRouteId = (pathname) => parseLocation({ pathname }).routeId;
export const getRouteZoom = (pathname) => parseLocation({ pathname }).routeZoom;
export const getPrimeNav = (pathname) => parseLocation({ pathname }).primeNav;
export const getStreamNav = (pathname) => parseLocation({ pathname }).streamNav;
