// The URL describes a page and, optionally, a dialog over that page.
// Times in paths are seconds; application ranges are milliseconds.
const dongleIdPattern = /^[a-f0-9]{16}$/;
const logIdPattern = /^[a-f0-9-]{20}$/;

const dialogs = new Set([
  'settings', 'settings-uploads', 'unpair', 'pair', 'filter',
  'files', 'info', 'uploads', 'clips', 'clip', 'delete-clip',
  'switch-prime', 'cancel-prime',
]);

function rangeFor(start, end, scale = 1) {
  if (!/^\d+(\.\d+)?$/.test(start) || !/^\d+(\.\d+)?$/.test(end)) return null;
  const range = { start: Math.round(Number(start) * scale), end: Math.round(Number(end) * scale) };
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.end > range.start
    ? range : null;
}

export function parseLocation(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const parts = pathname.replace(/\/$/, '').split('/').slice(1);
  const navigation = {
    page: 'not-found', dongleId: null, logId: null, range: null, legacy: null,
    dialog: null, dialogDevice: null, clip: null,
  };
  if (pathname === '/' || pathname === '') {
    navigation.page = 'home';
  } else if (parts.length === 1 && ['demo', 'referrals', 'auth'].includes(parts[0])) {
    navigation.page = parts[0];
  } else if (dongleIdPattern.test(parts[0])) {
    const [dongleId, logId, start, end] = parts;
    if (parts.length === 1) {
      Object.assign(navigation, { page: 'device', dongleId });
    } else if (parts.length === 2 && ['prime', 'stream'].includes(logId)) {
      Object.assign(navigation, { page: logId, dongleId });
    } else if (logIdPattern.test(logId) && (parts.length === 2 || parts.length === 4)) {
      const range = parts.length === 4 ? rangeFor(start, end, 1000) : null;
      if (parts.length === 2 || range) Object.assign(navigation, { page: 'drive', dongleId, logId, range });
    } else if (parts.length === 3) {
      const legacy = rangeFor(logId, start);
      if (legacy) Object.assign(navigation, { page: 'legacy', dongleId, legacy });
    }
  }

  const query = new URLSearchParams(search);
  const dialog = query.get('dialog');
  const dialogDevice = query.get('device') || navigation.dongleId;
  const clip = query.get('clip');
  const driveDialog = ['files', 'info', 'uploads'].includes(dialog);
  const primeDialog = ['switch-prime', 'cancel-prime'].includes(dialog);
  const settingsDialog = ['settings', 'settings-uploads', 'unpair'].includes(dialog);
  const clipDialog = ['clips', 'clip', 'delete-clip'].includes(dialog);
  if (dialogs.has(dialog) && !['auth', 'not-found'].includes(navigation.page)
    && (!driveDialog || navigation.page === 'drive')
    && (!primeDialog || navigation.page === 'prime')
    && (!settingsDialog || dongleIdPattern.test(dialogDevice))
    && (!clipDialog || (navigation.dongleId && ['device', 'drive'].includes(navigation.page)))
    && (!['clip', 'delete-clip'].includes(dialog) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.mp4$/.test(clip))) {
    Object.assign(navigation, {
      dialog, dialogDevice: settingsDialog ? dialogDevice : navigation.dongleId,
      clip: ['clip', 'delete-clip'].includes(dialog) ? clip : null,
    });
  }
  return navigation;
}

export function pathFor({ page = 'device', dongleId, logId, range, legacy }) {
  if (['home', 'not-found'].includes(page)) return '/';
  if (['demo', 'referrals', 'auth'].includes(page)) return '/' + page;
  const parts = [dongleId];
  if (page === 'drive') {
    parts.push(logId);
    if (range) parts.push(range.start / 1000, range.end / 1000);
  } else if (page === 'legacy') {
    parts.push(legacy.start, legacy.end);
  } else if (page !== 'device') {
    parts.push(page);
  }
  return '/' + parts.join('/');
}

// Keep unrelated query arguments and hashes when changing a dialog or normalizing a path.
export function locationFor(navigation, location = {}) {
  const query = new URLSearchParams(location.search);
  for (const key of ['dialog', 'device', 'clip']) query.delete(key);
  if (navigation.dialog) {
    query.set('dialog', navigation.dialog);
    if (navigation.dialogDevice && navigation.dialogDevice !== navigation.dongleId) {
      query.set('device', navigation.dialogDevice);
    }
    if (navigation.clip) query.set('clip', navigation.clip);
  }
  const search = query.toString();
  return {
    pathname: pathFor(navigation),
    search: search ? '?' + search : '',
    hash: location.hash || '',
  };
}

export function sameRange(a, b) {
  return a?.start === b?.start && a?.end === b?.end;
}
