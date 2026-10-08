const DONGLE_ID = /^[a-f0-9]{16}$/i;
const LOG_ID = /^[a-f0-9-]{20}$/i;
const TIMESTAMP = /^\d{13}$/;

const DIALOGS = new Set([
  'pair',
  'filter',
  'settings',
  'settings-unpair',
  'settings-uploads',
  'uploads',
  'prime-cancel',
  'prime-switch',
  'clips',
  'clip',
  'clip-delete',
]);

function normalizeLocation(location = '/') {
  if (typeof location === 'string') {
    const url = new URL(location, 'http://connect.local');
    return { pathname: url.pathname, search: url.search, hash: url.hash };
  }

  return {
    pathname: location.pathname || '/',
    search: location.search || '',
    hash: location.hash || '',
  };
}

function validRange(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

function dialogParams(destination) {
  if (!destination.dialog || !DIALOGS.has(destination.dialog)) {
    return {};
  }

  const dialog = { dialog: destination.dialog };
  if (destination.dialogDeviceId && DONGLE_ID.test(destination.dialogDeviceId)) {
    dialog.device = destination.dialogDeviceId;
  }
  if ((destination.dialog === 'clip' || destination.dialog === 'clip-delete')
      && typeof destination.clip === 'string' && destination.clip.length > 0) {
    dialog.clip = destination.clip;
  }

  if ((destination.dialog === 'clip' || destination.dialog === 'clip-delete') && !dialog.clip) {
    return {};
  }

  return dialog;
}

function withCanonicalLocation(destination, location) {
  const params = new URLSearchParams(location.search);
  params.delete('dialog');
  params.delete('device');
  params.delete('clip');
  params.delete('filterStart');
  params.delete('filterEnd');
  for (const [key, value] of Object.entries(dialogParams(destination))) {
    params.set(key, value);
  }
  if (destination.filter && validRange(destination.filter.start, destination.filter.end)) {
    params.set('filterStart', String(destination.filter.start));
    params.set('filterEnd', String(destination.filter.end));
  }

  const suffix = params.toString();
  const path = destination.page === 'legacy' ? location.pathname : buildPath(destination);
  return `${path}${suffix ? `?${suffix}` : ''}${location.hash}`;
}

function buildPath(destination) {
  if (destination.page === 'referrals') {
    return '/referrals';
  }
  if (!destination.dongleId || !DONGLE_ID.test(destination.dongleId)) {
    return '/';
  }

  const base = `/${destination.dongleId}`;
  if (destination.page === 'prime') {
    return `${base}/prime`;
  }
  if (destination.page === 'stream') {
    return `${base}/stream`;
  }
  if (destination.page !== 'drive' || !destination.logId || !LOG_ID.test(destination.logId)) {
    return base;
  }

  const path = `${base}/${destination.logId}`;
  if (!destination.range) {
    return path;
  }

  const { start, end } = destination.range;
  if (!validRange(start, end)) {
    return path;
  }
  return `${path}/${Math.floor(start / 1000)}/${Math.ceil(end / 1000)}`;
}

/** Parse a browser location into the page and dialog shown by the application. */
export function parseLocation(input = '/') {
  const location = normalizeLocation(input);
  const parts = location.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(location.search);

  if (parts[0] === 'auth') {
    return { page: 'auth', dongleId: null, logId: null, range: null, dialog: null };
  }
  if (parts.length === 1 && parts[0] === 'demo') {
    // Keep the backend-selection entry point intact until startup routes to its synthetic device.
    return { page: 'home', dongleId: null, logId: null, range: null, dialog: null };
  }
  if (parts.length === 1 && parts[0] === 'referrals') {
    const destination = { page: 'referrals', dongleId: null, logId: null, range: null, dialog: null };
    return parseDialog(destination, params, location);
  }

  const dongleId = parts[0];
  const base = { page: 'home', dongleId: null, logId: null, range: null, dialog: null };
  if (!dongleId || !DONGLE_ID.test(dongleId)) {
    return parseDialog(base, params, location);
  }

  const queryStart = Number(params.get('filterStart'));
  const queryEnd = Number(params.get('filterEnd'));
  const filter = validRange(queryStart, queryEnd) ? { start: queryStart, end: queryEnd } : null;
  const dashboard = { ...base, page: 'dashboard', dongleId, filter };
  let destination = dashboard;

  if (parts.length === 1) {
    destination = dashboard;
  } else if (parts.length === 2 && parts[1] === 'prime') {
    destination = { ...dashboard, page: 'prime' };
  } else if (parts.length === 2 && parts[1] === 'stream') {
    destination = { ...dashboard, page: 'stream' };
  } else if ((parts.length === 2 || parts.length === 4) && LOG_ID.test(parts[1])) {
    destination = { ...dashboard, page: 'drive', logId: parts[1] };
    if (parts.length === 4 && /^(0|[1-9]\d*)$/.test(parts[2]) && /^(0|[1-9]\d*)$/.test(parts[3])) {
      const start = Number(parts[2]) * 1000;
      const end = Number(parts[3]) * 1000;
      if (validRange(start, end)) {
        destination = { ...destination, range: { start, end } };
      } else {
        destination = dashboard;
      }
    } else if (parts.length === 4) {
      destination = dashboard;
    }
  } else if (parts.length === 3 && TIMESTAMP.test(parts[1]) && TIMESTAMP.test(parts[2])) {
    const start = Number(parts[1]);
    const end = Number(parts[2]);
    if (validRange(start, end)) {
      destination = { ...dashboard, page: 'legacy', range: { start, end } };
    }
  }

  return parseDialog(destination, params, location);
}

function parseDialog(destination, params, location) {
  const dialog = params.get('dialog');
  const clip = params.get('clip');
  if (dialog && DIALOGS.has(dialog) && (!(dialog === 'clip' || dialog === 'clip-delete') || clip)) {
    const targetDevice = params.get('device');
    destination = {
      ...destination,
      dialog,
      dialogDeviceId: targetDevice && DONGLE_ID.test(targetDevice) ? targetDevice : null,
      clip: dialog === 'clip' || dialog === 'clip-delete' ? clip : null,
    };
  }

  const canonicalPath = withCanonicalLocation(destination, location);
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  return currentPath === canonicalPath ? destination : { ...destination, canonicalPath };
}

/** Build a URL for a page/dialog while retaining unrelated query parameters. */
export function buildLocation(destination, currentLocation = '/') {
  const location = normalizeLocation(currentLocation);
  return withCanonicalLocation(destination, location);
}

/** Return the parent view when closing a nested dialog. */
export function parentDestination(destination) {
  switch (destination.dialog) {
    case 'settings-unpair':
    case 'settings-uploads':
      return { ...destination, dialog: 'settings', clip: null };
    case 'clip-delete':
    case 'clip':
      return { ...destination, dialog: 'clips', clip: null };
    default:
      return { ...destination, dialog: null, clip: null, dialogDeviceId: null };
  }
}
