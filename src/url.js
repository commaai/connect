const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^(?:\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}|[a-f0-9]{8}--[a-f0-9]{10})$/;

const settingsModals = new Set(['settings', 'settings-unpair', 'settings-uploads']);
const driveModals = new Set(['drive-info', 'drive-files', 'drive-clips', 'drive-uploads']);
const primeModals = new Set(['prime-cancel', 'prime-switch']);
const primePlans = new Set(['data', 'nodata']);
const validClipFilename = (filename) => typeof filename === 'string' && filename.length <= 255
  && /^[^/\\]+\.mp4$/i.test(filename)
  && [...filename].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);

function locationParts(location) {
  if (typeof location === 'string') {
    const hashIndex = location.indexOf('#');
    const hash = hashIndex < 0 ? '' : location.slice(hashIndex);
    const pathAndSearch = hashIndex < 0 ? location : location.slice(0, hashIndex);
    const searchIndex = pathAndSearch.indexOf('?');
    return {
      pathname: searchIndex < 0 ? pathAndSearch : pathAndSearch.slice(0, searchIndex),
      search: searchIndex < 0 ? '' : pathAndSearch.slice(searchIndex),
      hash,
    };
  }
  return {
    pathname: location?.pathname,
    search: typeof location?.search === 'string' ? location.search : '',
    hash: typeof location?.hash === 'string' ? location.hash : '',
  };
}

function validRange(range) {
  return Boolean(range && Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.end > range.start);
}

const validFilter = (range) => validRange(range) && range.end <= 8640000000000000;

// Drive URLs use seconds; application offsets are integral milliseconds.
// Parse decimal digits directly to avoid floating-point rounding at e.g. 1.001s.
function parseRange(start, end, seconds) {
  const pattern = seconds ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/;
  if (!pattern.test(start) || !pattern.test(end)) return null;
  const toMilliseconds = (value) => {
    if (!seconds) return Number(value);
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  };
  const range = { start: toMilliseconds(start), end: toMilliseconds(end) };
  return validRange(range) ? range : null;
}

function emptyRoute(page) {
  return {
    page, dongleId: null, selectedRouteId: null, zoom: null, legacyZoom: null,
    modal: null, modalDongleId: null, plan: null, clip: null, clipAction: null,
    filter: null,
  };
}

function parsePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || /[\\\s?#]/.test(pathname)) {
    return emptyRoute('notFound');
  }
  if (pathname === '/') return emptyRoute('home');
  let parts;
  try {
    parts = pathname.replace(/\/$/, '').slice(1).split('/').map(decodeURIComponent);
  } catch {
    return emptyRoute('notFound');
  }
  if (parts.length === 1 && ['demo', 'auth', 'referrals'].includes(parts[0])) {
    return emptyRoute(parts[0]);
  }
  if (!dongleIdRegex.test(parts[0])) return emptyRoute('notFound');
  const route = { ...emptyRoute('device'), dongleId: parts[0] };
  if (parts.length === 1) return route;
  if (parts.length === 2 && parts[1] === 'settings') {
    return { ...route, modal: 'settings', modalDongleId: route.dongleId };
  }
  if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
    return { ...route, page: parts[1] };
  }
  if (logIdRegex.test(parts[1])) {
    if (parts.length !== 2 && parts.length !== 4) return emptyRoute('notFound');
    const zoom = parts.length === 4 ? parseRange(parts[2], parts[3], true) : null;
    if (parts.length === 4 && !zoom) return emptyRoute('notFound');
    return { ...route, page: 'drive', selectedRouteId: parts[1], zoom };
  }
  if (parts.length === 3) {
    const legacyZoom = parseRange(parts[1], parts[2], false);
    if (legacyZoom) return { ...route, page: 'legacy', legacyZoom };
  }
  return emptyRoute('notFound');
}

/** Parse shareable URL state. Invalid paths never expose partial device/range state. */
export function parseLocation(location) {
  const { pathname, search } = locationParts(location);
  const route = parsePath(pathname);
  if (route.page === 'auth' || route.page === 'notFound') return route;
  const params = new URLSearchParams(search);
  const single = (key) => params.getAll(key).length === 1 ? params.get(key) : null;
  const filter = parseRange(single('from'), single('to'), false);
  if (validFilter(filter)) route.filter = filter;
  // The settings path names its target directly; query selectors cannot retarget it.
  if (route.modal === 'settings') return route;
  const modal = params.getAll('modalDevice').length > 1 ? null : single('modal');
  const modalDongleId = params.has('modalDevice') ? single('modalDevice') : route.dongleId;
  const plan = single('plan');
  if (route.page === 'prime' && primePlans.has(plan)) route.plan = plan;
  if (settingsModals.has(modal) && dongleIdRegex.test(modalDongleId)) {
    route.modal = modal;
    route.modalDongleId = modalDongleId;
  } else if (modal === 'add-device'
    || (modal === 'filter' && ['home', 'demo', 'device'].includes(route.page))
    || (modal === 'device-clips' && ['home', 'demo', 'device'].includes(route.page))
    || (driveModals.has(modal) && route.page === 'drive')
    || (primeModals.has(modal) && route.page === 'prime')) {
    route.modal = modal;
  }
  const clip = single('clip');
  const clipAction = single('clipAction');
  if (['drive-clips', 'device-clips'].includes(route.modal)
    && validClipFilename(clip) && ['view', 'delete'].includes(clipAction)) {
    route.clip = clip;
    route.clipAction = clipAction;
  }
  return route;
}

function requireIdentifier(value, pattern, name) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}

function rangePath(range, seconds) {
  if (!validRange(range)) throw new TypeError('Invalid URL range');
  // Splitting integral ms preserves precision even near MAX_SAFE_INTEGER.
  const serialize = (value) => {
    if (!seconds) return String(value);
    const whole = Math.floor(value / 1000);
    const fraction = String(value % 1000).padStart(3, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : String(whole);
  };
  return `/${serialize(range.start)}/${serialize(range.end)}`;
}

/** Build a canonical path from parsed route state, including its supported modal. */
export function pathForState(route = { page: 'home' }) {
  let pathname;
  if (route.page === 'home') {
    pathname = '/';
  } else if (['demo', 'auth', 'referrals'].includes(route.page)) {
    pathname = `/${route.page}`;
  } else if (['device', 'prime', 'stream', 'drive', 'legacy'].includes(route.page)) {
    pathname = `/${requireIdentifier(route.dongleId, dongleIdRegex, 'device ID')}`;
    if (route.page === 'prime' || route.page === 'stream') pathname += `/${route.page}`;
    if (route.page === 'drive') {
      pathname += `/${requireIdentifier(route.selectedRouteId, logIdRegex, 'route ID')}`;
      if (route.zoom != null) pathname += rangePath(route.zoom, true);
    }
    if (route.page === 'legacy') pathname += rangePath(route.legacyZoom, false);
  } else {
    throw new TypeError('Invalid URL page');
  }
  const location = withModal(withFilter(pathname, route.filter), route.modal, route.modalDongleId, route.plan);
  return route.clip ? withClip(location, route.clip, route.clipAction) : location;
}

/** Keep dashboard dates separate from relative drive offsets and overlay state. */
export function withFilter(location, filter) {
  const { pathname, search, hash } = locationParts(location);
  const params = new URLSearchParams(search);
  params.delete('from');
  params.delete('to');
  if (filter != null) {
    if (!validFilter(filter)) throw new TypeError('Invalid date filter');
    params.set('from', String(filter.start));
    params.set('to', String(filter.end));
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

/** Change an overlay without losing its background route or unrelated query/hash. */
export function withModal(location, modal, modalDongleId, plan) {
  const parts = locationParts(location);
  const route = parsePath(parts.pathname);
  const pathname = route.modal === 'settings' ? `/${route.dongleId}` : parts.pathname;
  const { search, hash } = parts;
  const params = new URLSearchParams(search);
  for (const key of ['modal', 'modalDevice', 'plan', 'clip', 'clipAction']) params.delete(key);
  if (modal) params.set('modal', modal);
  if (modal && modalDongleId) params.set('modalDevice', modalDongleId);
  if (plan) params.set('plan', plan);
  const candidate = parseLocation({ pathname, search: params.toString() });
  if (candidate.modal !== modal) params.delete('modal');
  if (!candidate.modalDongleId || !modalDongleId) params.delete('modalDevice');
  if (!candidate.plan) params.delete('plan');
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

/** Select a clip inside its library; navigation never performs a clip operation. */
export function withClip(location, filename, action) {
  const { pathname, search, hash } = locationParts(location);
  const params = new URLSearchParams(search);
  params.delete('clip');
  params.delete('clipAction');
  if (validClipFilename(filename) && ['view', 'delete'].includes(action)) {
    params.set('clip', filename);
    params.set('clipAction', action);
  }
  const candidate = parseLocation({ pathname, search: params.toString() });
  if (!candidate.clip) {
    params.delete('clip');
    params.delete('clipAction');
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

/** Keep post-login return links inside supported application pages. */
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  const { page } = parseLocation(value);
  return page === 'notFound' || page === 'auth' ? '/' : value;
}

/** Normalize accepted input aliases without changing normal links or unrelated URL state. */
export function canonicalLocation(location) {
  const { pathname, search, hash } = locationParts(location);
  return parsePath(pathname).modal === 'settings'
    ? withModal(location, 'settings') : `${pathname}${search}${hash}`;
}

const parsedLocations = new WeakMap();

/** Reuse the parsed route while Redux updates data or playback at the same location. */
export function selectLocation(state) {
  const location = state.router.location;
  if (!parsedLocations.has(location)) parsedLocations.set(location, parseLocation(location));
  return parsedLocations.get(location);
}
