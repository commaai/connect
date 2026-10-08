// The only place that reads or writes a connect URL.
//
//   /                                 home. Startup picks a device when this is the whole URL.
//   /demo                             demo device, same as home
//   /referrals                        referrals. The open device and drive stay put.
//   /auth/...                         login callback
//   /:dongleId                        device
//   /:dongleId/prime                  prime
//   /:dongleId/stream                 live stream
//   /:dongleId/:logId                 drive
//   /:dongleId/:logId/:start/:end     that drive, zoomed to whole seconds
//   /:dongleId/:start/:end            old drive link. :start and :end are unix milliseconds.
//
//   ?settings=<dongleId>              settings for that device, over the current page
//   ?uploads=1                        upload queue for the open settings, or for the open drive
//   ?add=1                            pair a device
//   ?filter=1                         date filter
//   ?from=<ms>&to=<ms>                dashboard range. Omitted when the range is the default.
//
// ?pair= and ?r= belong to pairing and login. Callers leave them alone.

const DONGLE = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;

function partsOf(pathname) {
  return String(pathname || '').split('/').filter(Boolean);
}

function finite(value) {
  if (value == null || value === '') return false;
  return Number.isFinite(Number(value));
}

function parseQuery(search) {
  const params = new URLSearchParams(search || '');
  const settings = params.get('settings');
  const from = params.get('from');
  const to = params.get('to');
  return {
    settings: settings && DONGLE.test(settings) ? settings : null,
    uploads: params.get('uploads') === '1',
    add: params.get('add') === '1',
    filterOpen: params.get('filter') === '1',
    filter: finite(from) && finite(to) ? { start: Number(from), end: Number(to) } : null,
  };
}

function blank(query) {
  return {
    page: 'home',
    dongleId: null,
    logId: null,
    zoom: null,
    legacy: null,
    ...query,
  };
}

// pathname + search -> one view. `zoom` is milliseconds. `legacy` is the raw unix range.
export function parseUrl(pathname, search = '') {
  const query = parseQuery(search);
  const parts = partsOf(pathname);
  if (parts.length === 0) return blank(query);
  if (parts[0] === 'referrals') return { ...blank(query), page: 'referrals' };
  if (parts[0] === 'auth') return { ...blank(query), page: 'auth' };
  if (parts[0] === 'demo') return { ...blank(query), page: 'demo' };
  if (!DONGLE.test(parts[0])) return { ...blank(query), page: 'unknown' };

  const dongleId = parts[0];
  if (parts.length === 1) return { ...blank(query), page: 'device', dongleId };

  if (parts.length === 2 && parts[1] === 'prime') return { ...blank(query), page: 'prime', dongleId };
  if (parts.length === 2 && parts[1] === 'stream') return { ...blank(query), page: 'stream', dongleId };

  if (LOG_ID.test(parts[1])) {
    const zoom = parts.length >= 4 && finite(parts[2]) && finite(parts[3])
      ? { start: Number(parts[2]) * 1000, end: Number(parts[3]) * 1000 }
      : null;
    return { ...blank(query), page: 'drive', dongleId, logId: parts[1], zoom };
  }

  if (parts.length >= 3 && finite(parts[1]) && finite(parts[2])) {
    return {
      ...blank(query),
      page: 'legacy',
      dongleId,
      legacy: { start: Number(parts[1]), end: Number(parts[2]) },
    };
  }

  return { ...blank(query), page: 'unknown', dongleId };
}

export function deviceUrl(dongleId) {
  return `/${dongleId}`;
}

export function primeUrl(dongleId) {
  return `/${dongleId}/prime`;
}

export function streamUrl(dongleId) {
  return `/${dongleId}/stream`;
}

// `range` is milliseconds. A missing range, or one that rounds to nothing, is the whole drive.
export function driveUrl(dongleId, logId, range) {
  const path = `/${dongleId}/${logId}`;
  if (!range) return path;
  const start = Math.floor(range.start / 1000);
  const end = Math.ceil(range.end / 1000);
  if (!(end > start)) return path;
  return `${path}/${start}/${end}`;
}

// Keep a custom dashboard range on the next path. Modal and login params stay behind.
export function withFilter(location, path) {
  const current = new URLSearchParams(location?.search || '');
  if (!current.has('from') || !current.has('to')) return path;
  const next = new URLSearchParams();
  next.set('from', current.get('from'));
  next.set('to', current.get('to'));
  return `${path}?${next.toString()}`;
}

// Change query keys on the current path. null deletes a key.
export function editUrl(pathname, search, changes) {
  const params = new URLSearchParams(search || '');
  Object.entries(changes).forEach(([key, value]) => {
    if (value == null || value === false) params.delete(key);
    else params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Settings name a device the viewer owns, which may not be the device on screen.
// A shared demo device is not an owner, so its settings stay closed.
export function visibleSettings(view, state) {
  if (!view?.settings || !state) return null;
  const record = (state.devices || []).find((item) => item.dongle_id === view.settings)
    || (state.device?.dongle_id === view.settings ? state.device : null);
  if (!record || !(record.is_owner || state.profile?.superuser)) return null;
  return record;
}

export function getDongleID(pathname) {
  return parseUrl(pathname).dongleId;
}

export function getRouteId(pathname) {
  const view = parseUrl(pathname);
  return view.page === 'drive' ? view.logId : null;
}
