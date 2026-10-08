import { DEMO_DONGLE_ID } from './api/demo';

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const decimalRegex = /^\d+(?:\.\d+)?$/;
const dialogs = new Set(['settings', 'add-device', 'time-filter', 'files', 'route-info', 'clips', 'uploads', 'prime-plan', 'prime-cancel']);

function locationParts(location) {
  if (typeof location !== 'string') {
    return { pathname: location?.pathname || '/', search: location?.search || '', hash: location?.hash || '' };
  }
  const match = location.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return { pathname: match?.[1] || '/', search: match?.[2] || '', hash: match?.[3] || '' };
}

function range(start, end, scale = 1) {
  const parseBound = (value) => {
    if (!decimalRegex.test(value)) return NaN;
    const [whole, fraction = ''] = value.split('.');
    const precision = scale === 1000 ? 3 : 0;
    if (fraction.length > precision) return NaN;
    return Number(whole) * scale + Number(fraction.padEnd(precision, '0'));
  };
  const bounds = { start: parseBound(start), end: parseBound(end) };
  return Number.isSafeInteger(bounds.start) && Number.isSafeInteger(bounds.end)
    && bounds.start >= 0 && bounds.end > bounds.start ? bounds : null;
}

// This is the only URL grammar. Its result describes navigation intent; it does
// not select devices, fetch data, authorize an action, or mutate history.
export function parseLocation(location) {
  const parts = locationParts(location);
  const route = { ...parts, page: 'not-found', dongleId: null, routeId: null, zoom: null, legacyZoom: null, dialog: null, dialogDevice: null };
  if (!parts.pathname.startsWith('/') || parts.pathname.startsWith('//')) return route;
  let segments;
  try {
    segments = parts.pathname.replace(/\/$/, '').slice(1).split('/').filter((segment, index, all) => segment || all.length > 1);
    segments = segments.map(decodeURIComponent);
  } catch {
    return route;
  }
  if (segments.length === 0) route.page = 'home';
  else if (segments.length === 1 && ['demo', 'referrals', 'auth'].includes(segments[0])) {
    route.page = segments[0];
    if (route.page === 'demo') route.dongleId = DEMO_DONGLE_ID;
  } else if (dongleIdRegex.test(segments[0])) {
    const [dongleId, second, third, fourth] = segments;
    if (segments.length === 1) route.page = 'device';
    else if (segments.length === 2 && ['prime', 'stream'].includes(second)) route.page = second;
    else if (logIdRegex.test(second) && [2, 4].includes(segments.length)) {
      const zoom = segments.length === 4 ? range(third, fourth, 1000) : null;
      if (segments.length === 2 || zoom) {
        route.page = 'drive';
        route.routeId = second;
        route.zoom = zoom;
      }
    } else if (segments.length === 3) {
      const legacyZoom = range(second, third);
      if (legacyZoom) {
        route.page = 'legacy';
        route.legacyZoom = legacyZoom;
      }
    }
    if (route.page !== 'not-found') route.dongleId = dongleId;
  }

  const params = new URLSearchParams(parts.search);
  const dialog = params.get('dialog');
  const explicitDevice = params.get('dialogDevice');
  if (!dialogs.has(dialog) || ['not-found', 'auth', 'stream'].includes(route.page)
    || params.getAll('dialog').length !== 1 || params.getAll('dialogDevice').length > 1
    || (explicitDevice !== null && !dongleIdRegex.test(explicitDevice))) return route;
  const dialogDevice = explicitDevice || route.dongleId;
  if (dialog !== 'add-device' && !dialogDevice) return route;
  if (['prime-plan', 'prime-cancel'].includes(dialog) && (route.page !== 'prime' || dialogDevice !== route.dongleId)) return route;
  if (['files', 'route-info'].includes(dialog) && (route.page !== 'drive' || dialogDevice !== route.dongleId)) return route;
  if (dialog === 'time-filter' && (!['device', 'demo'].includes(route.page) || dialogDevice !== route.dongleId)) return route;
  if (dialog === 'clips' && (!['device', 'demo', 'drive'].includes(route.page) || dialogDevice !== route.dongleId)) return route;
  route.dialog = dialog;
  route.dialogDevice = dialog === 'add-device' ? null : dialogDevice;
  return route;
}

export function locationWithDialog(location, dialog, dialogDevice = null) {
  const parts = locationParts(location);
  const params = new URLSearchParams(parts.search);
  params.delete('dialog');
  params.delete('dialogDevice');
  if (dialog) {
    params.set('dialog', dialog);
    if (dialogDevice) params.set('dialogDevice', dialogDevice);
  }
  const query = params.toString();
  return { ...(typeof location === 'object' ? location : {}), ...parts, search: query ? `?${query}` : '' };
}

function seconds(milliseconds) {
  const whole = Math.floor(milliseconds / 1000);
  const fraction = String(milliseconds % 1000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function urlForLocation(route) {
  let pathname;
  switch (route.page) {
    case 'home': pathname = '/'; break;
    case 'demo': case 'referrals': case 'auth': pathname = `/${route.page}`; break;
    case 'device': pathname = `/${route.dongleId}`; break;
    case 'prime': case 'stream': pathname = `/${route.dongleId}/${route.page}`; break;
    case 'drive': {
      pathname = `/${route.dongleId}/${route.routeId}`;
      if (route.zoom) pathname += `/${seconds(route.zoom.start)}/${seconds(route.zoom.end)}`;
      break;
    }
    case 'legacy': pathname = `/${route.dongleId}/${route.legacyZoom.start}/${route.legacyZoom.end}`; break;
    default: pathname = route.pathname || '/';
  }
  return locationWithDialog({ pathname, search: route.search || '', hash: route.hash || '' }, route.dialog, route.dialogDevice);
}

// Compatibility selectors let existing consumers migrate without duplicating
// parsing rules. New navigation code should consume the complete route once.
export const getDongleID = (location) => parseLocation(location).dongleId;
export const getRouteId = (location) => parseLocation(location).routeId;
export const getRouteZoom = (location) => parseLocation(location).zoom;
export const getZoom = (location) => parseLocation(location).legacyZoom;
export const getPrimeNav = (location) => parseLocation(location).page === 'prime';
export const getStreamNav = (location) => parseLocation(location).page === 'stream';
export const getDialog = (location) => parseLocation(location).dialog;
