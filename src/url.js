const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

// Modal URLs overlay the current page; adding one never changes drive selection.
const modalPages = {
  settings: ['dashboard', 'drive', 'prime', 'referrals'],
  unpair: ['dashboard', 'drive', 'prime', 'referrals'],
  'settings-uploads': ['dashboard', 'drive', 'prime', 'referrals'],
  'add-device': ['home', 'dashboard', 'drive', 'prime', 'referrals'],
  filter: ['dashboard'],
  uploads: ['drive'],
  'cancel-prime': ['prime'],
  'switch-prime': ['prime'],
};

function range(parts, scale = 1) {
  const numberPattern = scale === 1000 ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
  if (parts.length !== 2 || !parts.every((part) => numberPattern.test(part))) return null;
  // Parse fractional seconds as integer milliseconds without float rounding.
  const [start, end] = parts.map((part) => {
    const [whole, fraction = ''] = part.split('.');
    return Number(whole) * scale + (scale === 1000 ? Number(fraction.padEnd(3, '0')) : 0);
  });
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end ? { start, end } : null;
}

// One pure boundary for location -> navigation. Invalid paths have no route state;
// invalid modal arguments are ignored without disturbing a valid underlying page.
export function parseLocation(location = '/') {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const parts = pathname.split('/').filter(Boolean);
  const navigation = { page: 'not-found', dongleId: null, routeId: null, routeZoom: null, legacyZoom: null, modal: null, modalDevice: null };
  if (!parts.length || (parts.length === 1 && parts[0] === 'demo')) navigation.page = 'home';
  else if (parts.length === 1 && ['auth', 'referrals'].includes(parts[0])) navigation.page = parts[0];
  else if (dongleIdRegex.test(parts[0])) {
    const [dongleId, section] = parts;
    if (parts.length === 1) navigation.page = 'dashboard';
    else if (parts.length === 2 && ['prime', 'stream'].includes(section)) navigation.page = section;
    else if (logIdRegex.test(section) && (parts.length === 2 || parts.length === 4)) {
      const zoom = parts.length === 4 ? range(parts.slice(2), 1000) : null;
      if (parts.length === 2 || zoom) {
        navigation.page = 'drive';
        navigation.routeId = section;
        navigation.routeZoom = zoom;
      }
    } else if (parts.length === 3) {
      const zoom = range(parts.slice(1));
      if (zoom) {
        navigation.page = 'legacy-drive';
        navigation.legacyZoom = zoom;
      }
    }
    if (navigation.page !== 'not-found') navigation.dongleId = dongleId;
  }
  const params = new URLSearchParams(search);
  const modal = params.get('modal');
  if (params.getAll('modal').length === 1 && modalPages[modal]?.includes(navigation.page)) {
    const settings = ['settings', 'unpair', 'settings-uploads'].includes(modal);
    const device = params.get('device') || navigation.dongleId;
    if (!settings || (params.getAll('device').length <= 1 && dongleIdRegex.test(device))) {
      navigation.modal = modal;
      navigation.modalDevice = settings ? device : null;
    }
  }
  return navigation;
}

export function pathForNavigation({ dongleId, routeId, routeZoom, page }) {
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  const parts = [dongleId];
  if (routeId) {
    parts.push(routeId);
    if (routeZoom) parts.push(routeZoom.start / 1000, routeZoom.end / 1000);
  } else if (['prime', 'stream'].includes(page)) parts.push(page);
  return `/${parts.join('/')}`;
}

export function locationForModal(location, modal, device) {
  const params = new URLSearchParams(location.search);
  params.delete('modal');
  params.delete('device');
  if (modal) params.set('modal', modal);
  if (device) params.set('device', device);
  const search = params.toString();
  return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash || '' };
}

// Compatibility selectors for existing callers, all backed by the same parser.
export const getDongleID = (pathname) => parseLocation(pathname).dongleId;
export const getZoom = (pathname) => parseLocation(pathname).legacyZoom;
export const getRouteId = (pathname) => parseLocation(pathname).routeId;
export const getRouteZoom = (pathname) => parseLocation(pathname).routeZoom;
export const getPrimeNav = (pathname) => parseLocation(pathname).page === 'prime';
export const getStreamNav = (pathname) => parseLocation(pathname).page === 'stream';
