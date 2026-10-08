import { DEMO_DONGLE_ID } from './api/demo';

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const devicePages = new Set(['prime', 'stream']);
const modals = new Set(['settings', 'uploads', 'pair', 'unpair', 'filter', 'prime-cancel', 'prime-plan']);

function range(start, end, scale = 1) {
  if (!/^\d+(?:\.\d+)?$/.test(start) || !/^\d+(?:\.\d+)?$/.test(end)) return null;
  const bounds = { start: Number(start) * scale, end: Number(end) * scale };
  return Number.isFinite(bounds.end) && bounds.start < bounds.end ? bounds : null;
}

// All routes are interpreted here, including initial loads and browser history.
// Drive ranges use seconds in the URL and milliseconds in application state.
export function parseLocation({ pathname = '/', search = '' } = {}) {
  const parts = pathname.split('/').filter(Boolean);
  const route = { page: 'home', dongleId: null, routeId: null, zoom: null, legacyRange: null, modal: null, modalDongleId: null };
  if (parts.length === 1 && ['auth', 'referrals'].includes(parts[0])) {
    route.page = parts[0];
  } else if (dongleIdRegex.test(parts[0]) || parts[0] === 'demo') {
    route.dongleId = parts[0] === 'demo' ? DEMO_DONGLE_ID : parts[0];
    route.page = 'dashboard';
    if (parts.length === 2 && devicePages.has(parts[1])) {
      route.page = parts[1];
    } else if ([2, 4].includes(parts.length) && logIdRegex.test(parts[1])) {
      route.page = 'drive';
      route.routeId = parts[1];
      route.zoom = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
      if (parts.length === 4 && !route.zoom) route.page = 'invalid';
    } else if (parts.length === 3 && range(parts[1], parts[2])) {
      route.legacyRange = range(parts[1], parts[2]);
    } else if (parts.length !== 1) {
      route.page = 'invalid';
    }
  } else if (parts.length) {
    route.page = 'invalid';
  }
  if (route.page === 'invalid') {
    route.dongleId = null;
    route.routeId = null;
    route.zoom = null;
  }

  // Modals overlay the current page, retaining its drive, range and query args.
  const query = new URLSearchParams(search);
  const modal = query.get('modal');
  const modalDongleId = query.get('device') || route.dongleId;
  const validPage = modal === 'filter' ? route.page === 'dashboard'
    : modal?.startsWith('prime-') ? route.page === 'prime' : true;
  if (modals.has(modal) && validPage && (modal === 'pair' || dongleIdRegex.test(modalDongleId))) {
    route.modal = modal;
    route.modalDongleId = modal === 'pair' ? null : modalDongleId;
  }
  return route;
}

export function deviceUrl(dongleId, page = 'dashboard', routeId = null, start = null, end = null) {
  if (!dongleId) return '/';
  const parts = [dongleId];
  if (page === 'drive' && routeId) {
    parts.push(routeId);
    if (start != null && end != null) parts.push(start, end);
  } else if (devicePages.has(page)) {
    parts.push(page);
  }
  return `/${parts.join('/')}`;
}

export function modalUrl(location, modal = null, dongleId = null) {
  const query = new URLSearchParams(location.search);
  query.delete('modal');
  query.delete('device');
  if (modals.has(modal)) {
    query.set('modal', modal);
    if (dongleId) query.set('device', dongleId);
  }
  const search = query.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash || ''}`;
}

// Compatibility helpers for callers that only need one field.
export const getDongleID = (pathname) => parseLocation({ pathname }).dongleId;
export const getZoom = (pathname) => parseLocation({ pathname }).legacyRange;
export const getRouteId = (pathname) => parseLocation({ pathname }).routeId;
export const getRouteZoom = (pathname) => parseLocation({ pathname }).zoom;
export const getPrimeNav = (pathname) => parseLocation({ pathname }).page === 'prime';
export const getStreamNav = (pathname) => parseLocation({ pathname }).page === 'stream';
