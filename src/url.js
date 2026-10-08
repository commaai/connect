const DONGLE_ID_PATTERN = '[a-f0-9]{16}';
const LOG_ID_PATTERN = '[a-f0-9-]{20}';

const dongleIdRegex = new RegExp(`^${DONGLE_ID_PATTERN}$`);
const logIdRegex = new RegExp(`^${LOG_ID_PATTERN}$`);

function partsFor(pathname) {
  return String(pathname || '').split('/').filter(Boolean);
}

function validRange(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

export function parsePathname(pathname) {
  const parts = partsFor(pathname);

  if (parts.length === 0) {
    return { page: 'home', dongleId: null, routeId: null, range: null };
  }
  if (parts.length === 1 && parts[0] === 'demo') {
    return { page: 'demo', dongleId: null, routeId: null, range: null };
  }
  if (parts.length === 1 && parts[0] === 'referrals') {
    return { page: 'referrals', dongleId: null, routeId: null, range: null };
  }
  if (!dongleIdRegex.test(parts[0])) {
    return { page: 'unknown', dongleId: null, routeId: null, range: null };
  }

  const dongleId = parts[0];
  if (parts.length === 1) {
    return { page: 'dashboard', dongleId, routeId: null, range: null };
  }
  if (parts.length === 2 && ['prime', 'stream', 'settings'].includes(parts[1])) {
    return { page: parts[1], dongleId, routeId: null, range: null };
  }
  if (logIdRegex.test(parts[1]) && (parts.length === 2 || parts.length === 4)) {
    const start = Number(parts[2]);
    const end = Number(parts[3]);
    const range = parts.length === 4 && validRange(start, end)
      ? { start: start * 1000, end: end * 1000 }
      : null;
    if (parts.length === 4 && !range) {
      return { page: 'unknown', dongleId, routeId: null, range: null };
    }
    return { page: 'drive', dongleId, routeId: parts[1], range };
  }
  if (parts.length === 3) {
    const start = Number(parts[1]);
    const end = Number(parts[2]);
    if (validRange(start, end)) {
      return { page: 'legacy-drive', dongleId, routeId: null, range: { start, end } };
    }
  }
  return { page: 'unknown', dongleId, routeId: null, range: null };
}

function seconds(milliseconds) {
  return Number((milliseconds / 1000).toFixed(3));
}

export function buildPath({ page = 'dashboard', dongleId, routeId, range } = {}) {
  if (page === 'home') return '/';
  if (page === 'demo') return '/demo';
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  if (page === 'prime' || page === 'stream' || page === 'settings') {
    return `/${dongleId}/${page}`;
  }
  if (page === 'drive' && routeId) {
    if (range && validRange(range.start, range.end)) {
      return `/${dongleId}/${routeId}/${seconds(range.start)}/${seconds(range.end)}`;
    }
    return `/${dongleId}/${routeId}`;
  }
  return `/${dongleId}`;
}

const pageDialogs = {
  dashboard: ['filter'],
  demo: ['filter'],
};
const settingsDialogs = ['unpair', 'uploads'];
const settingsPages = ['dashboard', 'demo', 'drive', 'prime', 'stream', 'referrals'];

export function getSettingsDongleId(pathname, search = '') {
  const { page, dongleId } = parsePathname(pathname);
  if (page === 'settings') return dongleId;
  if (!settingsPages.includes(page)) return null;
  const settings = new URLSearchParams(search).get('settings');
  return settings && dongleIdRegex.test(settings) ? settings : null;
}

export function getDialog(pathname, search = '') {
  const dialog = new URLSearchParams(search).get('dialog');
  if (getSettingsDongleId(pathname, search)) {
    return settingsDialogs.includes(dialog) ? dialog : null;
  }
  return pageDialogs[parsePathname(pathname).page]?.includes(dialog) ? dialog : null;
}

export function withSearch(location, values) {
  const params = new URLSearchParams(location.search || '');
  Object.entries(values).forEach(([key, value]) => {
    if (value == null) params.delete(key);
    else params.set(key, value);
  });
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash || ''}`;
}

export function withDialog(location, dialog) {
  return withSearch(location, { dialog });
}

export function getDongleID(pathname) {
  return parsePathname(pathname).dongleId;
}

export function getZoom(pathname) {
  const location = parsePathname(pathname);
  return location.page === 'legacy-drive' ? location.range : null;
}

export function getRouteId(pathname) {
  return parsePathname(pathname).routeId;
}

export function getRouteZoom(pathname) {
  const location = parsePathname(pathname);
  return location.page === 'drive' ? location.range : null;
}

export function getPrimeNav(pathname) {
  return parsePathname(pathname).page === 'prime';
}

export function getStreamNav(pathname) {
  return parsePathname(pathname).page === 'stream';
}
