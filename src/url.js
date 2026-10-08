const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const modalNames = new Set(['settings', 'pair', 'uploads', 'downloads', 'info', 'clips', 'filter', 'prime-cancel', 'prime-plan']);
const overlayParams = ['modal', 'device', 'clip', 'confirm', 'parent'];

function range(start, end, multiplier = 1) {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(start || '')
    || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(end || '')) return null;
  const result = { start: Number(start) * multiplier, end: Number(end) * multiplier };
  return Number.isFinite(result.start) && Number.isFinite(result.end)
    && result.start >= 0 && result.end > result.start ? result : null;
}

// Components consume this descriptor; history applies the same contract for
// initial links and every kind of history transition.
export function parseLocation(location = window.location) {
  const source = typeof location === 'string' ? { pathname: location } : location || {};
  const parts = typeof source.pathname === 'string' ? source.pathname.split('/').filter(Boolean) : [];
  const demo = parts[0] === 'demo';
  if (demo) parts.shift();
  const navigation = {
    view: 'dashboard', dongleId: null, routeId: null, zoom: null, legacyZoom: null,
    demo, valid: true, modal: null, modalDeviceId: null, clip: null, confirm: null, parentModal: null,
  };

  if (parts[0] === 'auth' && !demo) {
    navigation.view = 'auth';
    return navigation;
  }
  if (parts.length === 1 && parts[0] === 'referrals') {
    navigation.view = 'referrals';
  } else if (parts.length) {
    if (!dongleIdRegex.test(parts[0])) {
      navigation.valid = false;
      return navigation;
    }
    navigation.dongleId = parts[0];
    if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
      navigation.view = parts[1];
    } else if (logIdRegex.test(parts[1] || '') && [2, 4].includes(parts.length)) {
      navigation.routeId = parts[1];
      navigation.zoom = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
      navigation.valid = parts.length === 2 || Boolean(navigation.zoom);
      navigation.view = navigation.valid ? 'drive' : 'dashboard';
      if (!navigation.valid) navigation.routeId = null;
    } else if (parts.length === 3) {
      navigation.legacyZoom = range(parts[1], parts[2]);
      navigation.valid = Boolean(navigation.legacyZoom);
      navigation.view = navigation.valid ? 'drive' : 'dashboard';
    } else if (parts.length !== 1) {
      navigation.valid = false;
    }
  }

  if (!navigation.valid) return navigation;
  // /demo is the stable alias for the demo backend's single synthetic device.
  if (demo && !navigation.dongleId) navigation.dongleId = DEMO_DONGLE_ID;
  const params = new URLSearchParams(source.search || '');
  const modal = params.get('modal');
  const modalDeviceId = ['settings', 'uploads'].includes(modal)
    ? params.get('device') || navigation.dongleId : navigation.dongleId;
  const needsRoute = ['downloads', 'info'].includes(modal);
  const needsPrime = ['prime-cancel', 'prime-plan'].includes(modal);
  if (modalNames.has(modal) && (!needsRoute || navigation.routeId)
    && (!needsPrime || navigation.view === 'prime')
    && (modal !== 'filter' || navigation.view === 'dashboard')
    && (modal === 'pair' || dongleIdRegex.test(modalDeviceId || ''))) {
    navigation.modal = modal;
    navigation.modalDeviceId = modal === 'pair' ? null : modalDeviceId;
    navigation.clip = modal === 'clips' ? params.get('clip') || null : null;
    const confirm = params.get('confirm');
    if ((modal === 'settings' && confirm === 'unpair') || (modal === 'clips' && confirm === 'delete')) {
      navigation.confirm = confirm;
    }
    navigation.parentModal = modal === 'uploads' && params.get('parent') === 'settings' ? 'settings' : null;
  }
  return navigation;
}

export function pathForNavigation({ dongleId, routeId, zoom, view = 'dashboard', demo = false }) {
  const parts = demo ? ['demo'] : [];
  if (view === 'referrals') parts.push('referrals');
  else if (dongleId) {
    parts.push(dongleId);
    if (routeId) {
      parts.push(routeId);
      if (zoom) parts.push(zoom.start / 1000, zoom.end / 1000);
    } else if (['prime', 'stream'].includes(view)) parts.push(view);
  }
  return `/${parts.join('/')}`;
}

export function locationWithPath(location, pathname) {
  const params = new URLSearchParams(location?.search || '');
  overlayParams.forEach((key) => params.delete(key));
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}${location?.hash || ''}`;
}

export function locationWithModal(location, modal, options = {}) {
  const params = new URLSearchParams(location?.search || '');
  overlayParams.forEach((key) => params.delete(key));
  if (modalNames.has(modal)) {
    params.set('modal', modal);
    for (const key of ['device', 'clip', 'confirm', 'parent']) {
      if (options[key] != null) params.set(key, options[key]);
    }
  }
  const search = params.toString();
  return `${location?.pathname || '/'}${search ? `?${search}` : ''}${location?.hash || ''}`;
}

export const getDongleID = (pathname) => parseLocation(pathname).dongleId;
export const getZoom = (pathname) => parseLocation(pathname).legacyZoom;
export const getRouteId = (pathname) => parseLocation(pathname).routeId;
export const getRouteZoom = (pathname) => parseLocation(pathname).zoom;
export const getPrimeNav = (pathname) => parseLocation(pathname).view === 'prime';
export const getStreamNav = (pathname) => parseLocation(pathname).view === 'stream';
import { DEMO_DONGLE_ID } from './api/demo';
