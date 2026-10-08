// Drive ranges are integer seconds in URLs and milliseconds in application state.
// Legacy device/time/time links already contain absolute milliseconds.
const DEVICE = /^[a-f0-9]{16}$/;
const LOG = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;
const CLIP = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/;
const DEMO_DEVICE = 'deadbeefdeadbeef';
const DEVICE_PAGES = ['dashboard', 'drive', 'prime', 'referrals'];
const SETTINGS_PAGES = ['home', 'dashboard', 'drive', 'prime'];

export const MODALS = {
  settings: { pages: SETTINGS_PAGES, device: true, ownerOnly: true },
  unpair: { pages: SETTINGS_PAGES, device: true, ownerOnly: true },
  'settings-uploads': { pages: SETTINGS_PAGES, device: true, ownerOnly: true },
  pair: { pages: ['home', ...DEVICE_PAGES] },
  filter: { pages: ['dashboard'] },
  files: { pages: ['drive'] },
  info: { pages: ['drive'] },
  uploads: { pages: ['drive'], ownerOnly: true },
  clips: { pages: ['drive'], ownerOnly: true },
  clip: { pages: ['drive'], clip: true, ownerOnly: true },
  'delete-clip': { pages: ['drive'], clip: true, ownerOnly: true },
  'switch-prime': { pages: ['prime'], ownerOnly: true },
  'cancel-prime': { pages: ['prime'], ownerOnly: true },
};

// Both parsing and building use these exact segment layouts.
export const ROUTES = [
  { page: 'home', parts: [] },
  { page: 'referrals', parts: ['referrals'] },
  { page: 'auth', parts: ['auth'] },
  { page: 'dashboard', parts: ['demo'], demo: true },
  { page: 'drive', parts: ['demo', ':logId'], demo: true },
  { page: 'drive', parts: ['demo', ':logId', ':start', ':end'], demo: true, range: 'zoom' },
  { page: 'dashboard', parts: [':dongleId'] },
  { page: 'prime', parts: [':dongleId', 'prime'] },
  { page: 'stream', parts: [':dongleId', 'stream'] },
  { page: 'dashboard', parts: [':dongleId', 'settings'], alias: true },
  { page: 'drive', parts: [':dongleId', ':logId'] },
  { page: 'drive', parts: [':dongleId', ':logId', ':start', ':end'], range: 'zoom' },
  { page: 'legacy', parts: [':dongleId', ':start', ':end'], range: 'legacyRange' },
];

export function parseRange(start, end, scale = 1000) {
  if (![1, 1000].includes(scale) || typeof start !== 'string' || typeof end !== 'string'
      || !INTEGER.test(start) || !INTEGER.test(end)) return null;
  const first = Number(start) * scale;
  const last = Number(end) * scale;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first >= last) return null;
  return { start: first, end: last };
}

export function serializeRange(start, end, scale = 1000) {
  if (![1, 1000].includes(scale) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end) return null;
  const first = Math.floor(start / scale);
  const last = Math.ceil(end / scale);
  if (!Number.isSafeInteger(first * scale) || !Number.isSafeInteger(last * scale)) return null;
  return { start: first, end: last };
}

function matches(token, value) {
  if (token === ':dongleId') return DEVICE.test(value);
  if (token === ':logId') return LOG.test(value);
  if (token === ':start' || token === ':end') return true;
  return token === value;
}

function modalError(state) {
  if (!state.modal) return state.modalDevice || state.clip ? 'invalid-modal' : null;
  const rule = Object.hasOwn(MODALS, state.modal) ? MODALS[state.modal] : null;
  if (!rule || !rule.pages.includes(state.page)) return 'invalid-modal';
  if (rule.device && !DEVICE.test(state.modalDevice || '')) return 'invalid-device';
  if (!rule.device && state.modalDevice) return 'invalid-device';
  if (rule.clip ? !CLIP.test(state.clip || '') : state.clip) return 'invalid-clip';
  return null;
}

export function parseLocation(location) {
  if (!location || typeof location.pathname !== 'string') return { ok: false, reason: 'unknown' };
  const { pathname, search = '', hash = '' } = location;
  if (typeof search !== 'string' || typeof hash !== 'string'
      || (search && !search.startsWith('?')) || (hash && !hash.startsWith('#'))) {
    return { ok: false, reason: 'invalid-location' };
  }
  // /auth/ is the existing authentication callback, not an application view.
  const parts = pathname === '/' ? [] : (pathname === '/auth/' ? ['auth'] : pathname.slice(1).split('/'));
  const route = pathname.startsWith('/') && ROUTES.find((entry) => entry.parts.length === parts.length
    && entry.parts.every((token, index) => matches(token, parts[index])));
  if (!route) return { ok: false, reason: 'unknown' };
  const state = {
    page: route.page, dongleId: route.demo ? DEMO_DEVICE : null, logId: null,
    zoom: null, legacyRange: null, modal: null, modalDevice: null, clip: null,
    demo: !!route.demo, search, hash,
  };
  const params = {};
  route.parts.forEach((token, index) => {
    if (token.startsWith(':')) params[token.slice(1)] = parts[index];
  });
  state.dongleId = params.dongleId ?? state.dongleId;
  state.logId = params.logId ?? null;
  if (route.range) {
    state[route.range] = parseRange(params.start, params.end, route.range === 'zoom' ? 1000 : 1);
    if (!state[route.range]) return { ok: false, reason: 'invalid-range' };
  }
  const query = new URLSearchParams(search);
  if (['modal', 'device', 'clip'].some((key) => query.getAll(key).length > 1)) {
    return { ok: false, reason: 'duplicate-query' };
  }
  state.modal = query.get('modal') ?? (route.alias ? 'settings' : null);
  state.modalDevice = query.get('device');
  state.clip = query.get('clip');
  if (state.modal && Object.hasOwn(MODALS, state.modal) && MODALS[state.modal].device) {
    state.modalDevice ??= state.dongleId;
  }
  if (query.has('modal') && !state.modal) return { ok: false, reason: 'invalid-modal' };
  if (['device', 'clip'].some((key) => query.has(key) && !query.get(key))) {
    return { ok: false, reason: 'empty-target' };
  }
  const error = modalError(state);
  return error ? { ok: false, reason: error } : { ok: true, state };
}

export function buildLocation(state) {
  if (!state || typeof state !== 'object') throw new RangeError('invalid-state');
  if ((state.zoom && state.page !== 'drive') || (state.legacyRange && state.page !== 'legacy')
      || (state.logId && state.page !== 'drive')) throw new RangeError('invalid-state');
  if ((state.search && (typeof state.search !== 'string' || !state.search.startsWith('?')))
      || (state.hash && (typeof state.hash !== 'string' || !state.hash.startsWith('#')))) {
    throw new RangeError('invalid-location');
  }
  if (!state.modal) state = { ...state, modalDevice: null, clip: null };
  const error = modalError(state);
  const route = ROUTES.find((entry) => !entry.alias && entry.page === state.page
    && !!entry.demo === !!state.demo && !!entry.range === !!(state.zoom || state.legacyRange));
  if (error || !route) throw new RangeError(error || 'unknown');
  if (state.demo && state.dongleId !== DEMO_DEVICE) throw new RangeError('invalid-device');
  const range = route.range && serializeRange(state[route.range]?.start, state[route.range]?.end,
    route.range === 'zoom' ? 1000 : 1);
  if (route.range && !range) throw new RangeError('invalid-range');
  const params = { dongleId: state.dongleId, logId: state.logId, ...range };
  const parts = route.parts.map((token) => token.startsWith(':') ? String(params[token.slice(1)]) : token);
  if (!route.parts.every((token, index) => matches(token, parts[index]))) throw new RangeError('invalid-id');
  // Keep unrelated query bytes, including signatures and flag-only arguments.
  const kept = (state.search || '').slice(1).split('&').filter((part) => part
    && !['modal', 'device', 'clip'].includes(new URLSearchParams(part).keys().next().value));
  const query = new URLSearchParams();
  if (state.modal) query.set('modal', state.modal);
  if (state.modalDevice && state.modalDevice !== state.dongleId) query.set('device', state.modalDevice);
  if (state.clip) query.set('clip', state.clip);
  const search = [...kept, query.toString()].filter(Boolean).join('&');
  return { pathname: state.page === 'auth' ? '/auth/' : `/${parts.join('/')}`,
    search: search ? `?${search}` : '', hash: state.hash || '' };
}

// Compatibility while callers move to the single location contract.
function pathState(pathname) {
  const compatible = typeof pathname === 'string' && pathname.length > 1
    ? pathname.replace(/\/$/, '') : pathname;
  const result = parseLocation({ pathname: compatible });
  return result.ok ? result.state : {};
}
export const getDongleID = (pathname) => pathState(pathname).dongleId ?? null;
export const getZoom = (pathname) => pathState(pathname).legacyRange ?? null;
export const getRouteId = (pathname) => pathState(pathname).logId ?? null;
export const getRouteZoom = (pathname) => pathState(pathname).zoom ?? null;
export const getPrimeNav = (pathname) => pathState(pathname).page === 'prime';
export const getStreamNav = (pathname) => pathState(pathname).page === 'stream';
