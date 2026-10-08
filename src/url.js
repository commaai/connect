const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;
const numberRegex = /^\d+(?:\.\d+)?$/;

export const dialogs = new Set([
  'settings',
  'unpair',
  'settings-uploads',
  'add-device',
  'filter',
  'uploads',
  'cancel-prime',
  'switch-plan',
]);

function parseRange(start, end, scale = 1) {
  if (!numberRegex.test(start) || !numberRegex.test(end)) {
    return null;
  }
  const range = {
    start: Number(start) * scale,
    end: Number(end) * scale,
  };
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
    return null;
  }
  return range;
}

export function parseLocation(location) {
  const pathname = typeof location === 'string' ? location : location?.pathname || '/';
  const search = typeof location === 'string' ? '' : location?.search || '';
  const parts = pathname.split('/').filter(Boolean);
  const view = {
    valid: true,
    page: 'home',
    dongleId: null,
    logId: null,
    range: null,
    legacyRange: null,
    dialog: null,
    dialogDevice: null,
  };

  if (pathname === '/demo') {
    view.page = 'demo';
  } else if (pathname === '/referrals') {
    view.page = 'referrals';
  } else if (parts.length === 0) {
    view.page = 'home';
  } else if (exactDongleIdRegex.test(parts[0])) {
    view.dongleId = parts[0];
    view.page = 'dashboard';
    if (parts.length === 2 && parts[1] === 'prime') {
      view.page = 'prime';
    } else if (parts.length === 2 && parts[1] === 'stream') {
      view.page = 'stream';
    } else if (parts.length === 2 && exactLogIdRegex.test(parts[1])) {
      view.page = 'drive';
      view.logId = parts[1];
    } else if (parts.length === 4 && exactLogIdRegex.test(parts[1])) {
      const range = parseRange(parts[2], parts[3], 1000);
      if (range) {
        view.page = 'drive';
        view.logId = parts[1];
        view.range = range;
      } else {
        view.valid = false;
      }
    } else if (parts.length === 3) {
      const range = parseRange(parts[1], parts[2]);
      if (range) {
        view.page = 'legacy';
        view.legacyRange = range;
      } else {
        view.valid = false;
      }
    } else if (parts.length !== 1) {
      view.valid = false;
    }
  } else {
    view.valid = false;
  }

  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  if (dialogs.has(dialog)) {
    const dialogDevice = query.get('device') || view.dongleId;
    const deviceDialog = ['settings', 'unpair', 'settings-uploads'].includes(dialog);
    const driveDialog = dialog === 'uploads';
    const primeDialog = ['cancel-prime', 'switch-plan'].includes(dialog);
    const pageDialog = ['add-device', 'filter'].includes(dialog);
    if ((!deviceDialog || exactDongleIdRegex.test(dialogDevice))
        && (!driveDialog || view.page === 'drive')
        && (!primeDialog || view.page === 'prime')
        && (!pageDialog || ['home', 'dashboard', 'demo'].includes(view.page))) {
      view.dialog = dialog;
      view.dialogDevice = deviceDialog ? dialogDevice : null;
    }
  }

  return view;
}

export function deviceUrl(dongleId, page = 'dashboard') {
  if (!dongleId) {
    return '/';
  }
  return `/${dongleId}${page === 'dashboard' ? '' : `/${page}`}`;
}

export function driveUrl(dongleId, logId, start = null, end = null) {
  const path = `${deviceUrl(dongleId)}/${logId}`;
  return start != null && end != null ? `${path}/${start / 1000}/${end / 1000}` : path;
}

export function dialogUrl(location, dialog, dongleId = null) {
  const query = new URLSearchParams(location.search || '');
  query.delete('dialog');
  query.delete('device');
  if (dialog) {
    query.set('dialog', dialog);
    if (dongleId) {
      query.set('device', dongleId);
    }
  }
  const search = query.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash || ''}`;
}

export function currentView(state) {
  return parseLocation(state.router?.location || window.location);
}

export function getDongleID(pathname) {
  return parseLocation(pathname).dongleId;
}

export function getZoom(pathname) {
  return parseLocation(pathname).legacyRange;
}

export function getRouteId(pathname) {
  return parseLocation(pathname).logId;
}

export function getRouteZoom(pathname) {
  return parseLocation(pathname).range;
}

export function getPrimeNav(pathname) {
  return parseLocation(pathname).page === 'prime';
}

export function getStreamNav(pathname) {
  return parseLocation(pathname).page === 'stream';
}
