import { generatePath, matchPath } from 'react-router-dom';
import { createPath } from 'history';

const devicePath = '/:dongleId([a-f0-9]{16})';
const secondsPattern = '\\d+|\\d+\\.\\d{1,3}';

// Every pathname is parsed and built from this table.
const routes = {
  home: '/',
  demo: '/demo',
  referrals: '/referrals',
  dashboard: devicePath,
  prime: `${devicePath}/prime`,
  stream: `${devicePath}/stream`,
  drive: `${devicePath}/:logId([a-f0-9-]{20})/:start(${secondsPattern})?/:end(${secondsPattern})?`,
  legacy: `${devicePath}/:from(\\d+)/:to(\\d+)`,
};

function isValidRange({ page, start, end, from, to }) {
  if (page === 'legacy') {
    [start, end] = [from, to];
  } else if (start == null && end == null) {
    return true;
  }
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start;
}

function parseSeconds(value) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

function formatSeconds(value) {
  if (value == null) {
    return undefined;
  }
  const whole = Math.floor(value / 1000);
  const fraction = String(value % 1000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseUrl(pathname) {
  const normalized = `/${pathname.split('/').filter(Boolean).join('/')}`;
  for (const [page, path] of Object.entries(routes)) {
    const match = matchPath(normalized, { path, exact: true, sensitive: true });
    if (!match) {
      continue;
    }
    const destination = { page };
    for (const [name, value] of Object.entries(match.params)) {
      if (value == null) {
        continue;
      }
      if (name === 'start' || name === 'end') {
        destination[name] = parseSeconds(value);
      } else if (name === 'from' || name === 'to') {
        destination[name] = Number(value);
      } else {
        destination[name] = value;
      }
    }
    if (isValidRange(destination)) {
      return destination;
    }
  }
  return { page: 'not-found' };
}

export function buildUrl(destination) {
  if (!destination || typeof destination !== 'object') {
    throw new TypeError('A URL destination is required');
  }

  const hasDriveStart = destination.start != null;
  const hasDriveEnd = destination.end != null;
  if (destination.page === 'drive' && hasDriveStart !== hasDriveEnd) {
    throw new TypeError('A drive range requires both start and end');
  }
  if (!isValidRange(destination)) {
    throw new TypeError('Invalid URL range');
  }
  if (!Object.hasOwn(routes, destination.page)) {
    throw new TypeError(`Unknown URL page: ${destination.page}`);
  }

  const pathname = generatePath(routes[destination.page], {
    ...destination,
    start: formatSeconds(destination.start),
    end: formatSeconds(destination.end),
  });
  // generatePath checks its parameter patterns case-insensitively.
  if (parseUrl(pathname).page === 'not-found') {
    throw new TypeError('Invalid URL destination');
  }
  return pathname;
}

export function anonymizeUrl(pathname) {
  const destination = parseUrl(pathname);
  if (destination.page === 'not-found') {
    return '/not-found';
  }
  const path = routes[destination.page].replace(/\([^)]*\)/g, '');
  const placeholders = Object.fromEntries(Object.keys(destination).map((name) => [name, `<${name}>`]));
  return decodeURIComponent(generatePath(path, placeholders));
}

export function normalizeInternalUrl(target, origin = window.location.origin) {
  if (typeof target !== 'string' || !target) {
    return null;
  }

  try {
    const base = new URL(origin);
    const url = new URL(target, base);
    const rootRelative = target.startsWith('/') && !target.startsWith('//');
    const authPath = url.pathname === '/auth' || url.pathname.startsWith('/auth/');
    const oneShotQuery = ['pair', 'r', 'stripe_success', 'stripe_cancelled']
      .some((name) => url.searchParams.has(name));
    if (!rootRelative || url.origin !== base.origin || authPath || oneShotQuery) {
      return null;
    }
    return createPath(url);
  } catch {
    return null;
  }
}

// Dialogs keep the page beneath them. Only settings can address another device.
const dialogs = {
  settings: { device: true },
  'settings-uploads': { device: true },
  'add-device': {},
  filter: { pages: ['home', 'demo', 'dashboard', 'legacy'] },
  uploads: { pages: ['drive'] },
};
const reservedDialogKeys = ['dialog', 'device'];
const noDialog = Object.freeze({ dialog: null, dialogDongleId: null });

function getDialogDefinition(dialog, page) {
  if (!Object.hasOwn(dialogs, dialog)) {
    return null;
  }
  const definition = dialogs[dialog];
  return !definition.pages || definition.pages.includes(page) ? definition : null;
}

function parseDialog(search, destination) {
  const query = new URLSearchParams(search);
  const names = query.getAll('dialog');
  const devices = query.getAll('device');
  if (names.length !== 1 || devices.length > 1) {
    return noDialog;
  }

  const dialog = names[0];
  const definition = getDialogDefinition(dialog, destination.page);
  if (!definition) {
    return noDialog;
  }
  if (!definition.device) {
    return devices.length ? noDialog : { ...noDialog, dialog };
  }

  const device = devices[0] ?? destination.dongleId;
  if (!matchPath(`/${device}`, { path: devicePath, exact: true, strict: true, sensitive: true })) {
    return noDialog;
  }
  return { dialog, dialogDongleId: device };
}

export function parseLocation({ pathname, search = '' }) {
  const destination = parseUrl(pathname);
  return { ...destination, ...parseDialog(search, destination) };
}

export function dialogUrl({ pathname, search = '', hash = '' }, dialog, values = {}) {
  const query = new URLSearchParams(search);
  reservedDialogKeys.forEach((key) => query.delete(key));

  if (dialog != null) {
    const destination = parseUrl(pathname);
    const definition = getDialogDefinition(dialog, destination.page);
    if (!definition) {
      throw new TypeError(`Dialog ${dialog} is not valid on page ${destination.page}`);
    }

    query.set('dialog', dialog);
    if (definition.device) {
      const fallback = destination.dongleId;
      const device = values.device ?? fallback;
      if (typeof device !== 'string'
        || !matchPath(`/${device}`, { path: devicePath, exact: true, strict: true, sensitive: true })) {
        throw new TypeError('Invalid dialog parameter: device');
      }
      if (device !== fallback) {
        query.set('device', device);
      }
    }
  }

  return createPath({ pathname, search: query.toString(), hash });
}

export function canonicalUrl({ pathname, search = '', hash = '' }) {
  const destination = parseUrl(pathname);
  const canonicalPath = destination.page === 'not-found' ? pathname : buildUrl(destination);
  const query = new URLSearchParams(search);
  const hasDialogState = reservedDialogKeys.some((key) => query.has(key));
  if (!hasDialogState) {
    return createPath({ pathname: canonicalPath, search, hash });
  }

  const { dialog, dialogDongleId } = parseDialog(search, destination);
  return dialogUrl(
    { pathname: canonicalPath, search, hash },
    dialog,
    { device: dialogDongleId },
  );
}

export function selectUrl(state) {
  return parseLocation(state.router.location);
}
