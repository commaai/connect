import { stringifyQuery } from './utils/query';

const dongleIdRegex = /^[a-f0-9]{16}$/i;
const logIdRegex = /^[a-f0-9-]{20}$/i;

function pathnameParts(pathname = '/') {
  return String(pathname).split('/').filter(Boolean);
}

function validRange(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

export function parseAppUrl(pathname = '/', search = '') {
  const parts = pathnameParts(pathname);
  const query = new URLSearchParams(search);
  const dongleId = dongleIdRegex.test(parts[0] || '') ? parts[0] : null;
  const routeId = dongleId && logIdRegex.test(parts[1] || '') ? parts[1] : null;
  const routeStart = Number(parts[2]);
  const routeEnd = Number(parts[3]);
  const routeZoom = routeId && parts.length === 4 && validRange(routeStart, routeEnd)
    ? { start: routeStart * 1000, end: routeEnd * 1000 }
    : null;
  const legacyStart = Number(parts[1]);
  const legacyEnd = Number(parts[2]);
  const legacyZoom = dongleId && !routeId && parts.length >= 3 && validRange(legacyStart, legacyEnd)
    ? { start: legacyStart, end: legacyEnd }
    : null;
  const zoom = parts.length >= 3 && parts[0] !== 'auth'
    ? { start: Number(parts[1]), end: Number(parts[2]) }
    : null;
  const primeNav = Boolean(dongleId && parts.length === 2 && parts[1] === 'prime');
  const streamNav = Boolean(dongleId && parts.length === 2 && parts[1] === 'stream');

  return {
    dongleId,
    routeId,
    routeZoom,
    legacyZoom,
    zoom,
    primeNav,
    streamNav,
    referrals: pathname === '/referrals',
    modal: query.get('modal'),
  };
}

export function buildAppUrl({ dongleId, routeId, start, end, page, modal, query }) {
  let pathname = '/';
  if (page === 'referrals') {
    pathname = '/referrals';
  } else if (dongleId) {
    const parts = [dongleId];
    if (page === 'prime' || page === 'stream') {
      parts.push(page);
    } else if (routeId) {
      parts.push(routeId);
      if (Number.isFinite(start) && Number.isFinite(end) && start != null && end != null) {
        parts.push(Math.floor(start / 1000), Math.floor(end / 1000));
      }
    }
    pathname = `/${parts.join('/')}`;
  }

  const params = { ...query };
  if (modal !== undefined) {
    if (modal == null) delete params.modal;
    else params.modal = modal;
  }
  const search = stringifyQuery(params);
  return search ? `${pathname}?${search}` : pathname;
}

export function updateAppUrl(pathname, search = '', updates = {}) {
  const current = parseAppUrl(pathname, search);
  const params = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (params[key] === undefined) params[key] = value;
    else if (Array.isArray(params[key])) params[key].push(value);
    else params[key] = [params[key], value];
  }
  const queryUpdates = { ...updates };
  delete queryUpdates.modal;
  const query = { ...params, ...queryUpdates };
  if (updates.modal == null) delete query.modal;
  else if (updates.modal !== undefined) query.modal = updates.modal;

  return buildAppUrl({
    dongleId: current.dongleId,
    routeId: current.routeId,
    start: current.routeZoom?.start,
    end: current.routeZoom?.end,
    page: current.referrals ? 'referrals' : (current.primeNav ? 'prime' : (current.streamNav ? 'stream' : undefined)),
    query,
  });
}

export function getDongleID(pathname) {
  return parseAppUrl(pathname).dongleId;
}

export function getZoom(pathname) {
  return parseAppUrl(pathname).zoom;
}

export function getRouteId(pathname) {
  return parseAppUrl(pathname).routeId;
}

export function getRouteZoom(pathname) {
  return parseAppUrl(pathname).routeZoom;
}

export function getPrimeNav(pathname) {
  return parseAppUrl(pathname).primeNav;
}

export function getStreamNav(pathname) {
  return parseAppUrl(pathname).streamNav;
}
