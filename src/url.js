const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

// Menus and confirmations use the same overlay mechanism as full dialogs.
const dialogPages = {
  settings: null, uploads: null, unpair: null, pair: null,
  filter: ['home', 'demo', 'device'],
  files: ['drive'], info: ['drive'], clips: ['drive'], clip: ['drive'], 'delete-clip': ['drive'],
  'prime-cancel': ['prime'], 'prime-switch': ['prime'],
};

// Keep route grammar and units here. Drive ranges are seconds in URLs and
// milliseconds in application state; legacy ranges are UTC milliseconds.
function range(start, end, scale = 1) {
  if (!/^\d+(\.\d+)?$/.test(start) || !/^\d+(\.\d+)?$/.test(end)) return null;
  const bounds = { start: Number(start) * scale, end: Number(end) * scale };
  return Number.isFinite(bounds.end) && bounds.start < bounds.end ? bounds : null;
}

export function parseLocation(location) {
  const { pathname = '/', search = '' } = typeof location === 'string' ? { pathname: location } : location;
  const parts = pathname.split('/').filter(Boolean);
  let route = { page: 'unknown', dongleId: null, routeId: null, zoom: null };
  if (!parts.length) route.page = 'home';
  else if (parts[0] === 'auth') route.page = 'auth';
  else if (parts.length === 1 && ['demo', 'referrals'].includes(parts[0])) route.page = parts[0];
  else if (dongleIdRegex.test(parts[0])) {
    const dongleId = parts[0];
    if (parts.length === 1) route = { ...route, page: 'device', dongleId };
    else if (parts.length === 2 && ['prime', 'stream'].includes(parts[1])) {
      route = { ...route, page: parts[1], dongleId };
    } else if ([2, 4].includes(parts.length) && logIdRegex.test(parts[1])) {
      const zoom = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
      if (parts.length === 2 || zoom) route = { page: 'drive', dongleId, routeId: parts[1], zoom };
    } else if (parts.length === 3) {
      const zoom = range(parts[1], parts[2]);
      if (zoom) route = { ...route, page: 'legacy', dongleId, zoom };
    }
  }
  const params = new URLSearchParams(search);
  const requestedDialog = params.get('dialog');
  const knownDialog = Object.prototype.hasOwnProperty.call(dialogPages, requestedDialog);
  const dialog = knownDialog && (!dialogPages[requestedDialog] || dialogPages[requestedDialog].includes(route.page))
    ? requestedDialog : null;
  const target = params.get('device') || route.dongleId;
  return {
    ...route,
    dialog,
    dialogDongleId: dongleIdRegex.test(target) ? target : null,
    clipFilename: params.get('clip'),
  };
}

export function pathFor({ page = 'device', dongleId, routeId, zoom }) {
  if (['home', 'demo', 'referrals'].includes(page)) return page === 'home' ? '/' : `/${page}`;
  const parts = [dongleId];
  if (page === 'drive') {
    parts.push(routeId);
    if (zoom) parts.push(zoom.start / 1000, zoom.end / 1000);
  } else if (page === 'legacy') parts.push(zoom.start, zoom.end);
  else if (['prime', 'stream'].includes(page)) parts.push(page);
  return `/${parts.join('/')}`;
}

// Overlays keep the underlying page URL and unrelated query arguments intact.
export function locationWithDialog(location, dialog, dongleId = null, clipFilename = null) {
  const params = new URLSearchParams(location.search);
  params.delete('dialog');
  params.delete('device');
  params.delete('clip');
  if (dialog) {
    params.set('dialog', dialog);
    if (clipFilename) params.set('clip', clipFilename);
    if (dongleId && dongleId !== parseLocation(location).dongleId) params.set('device', dongleId);
  }
  const search = params.toString();
  return { pathname: location.pathname, hash: location.hash, search: search ? `?${search}` : '' };
}

// Compatibility helpers for callers that only need one part of the route.
export const getDongleID = (pathname) => parseLocation(pathname).dongleId;
export const getZoom = (pathname) => {
  const route = parseLocation(pathname);
  return route.page === 'legacy' ? route.zoom : null;
};
export const getRouteId = (pathname) => parseLocation(pathname).routeId;
export const getRouteZoom = (pathname) => {
  const route = parseLocation(pathname);
  return route.page === 'drive' ? route.zoom : null;
};
export const getPrimeNav = (pathname) => parseLocation(pathname).page === 'prime';
export const getStreamNav = (pathname) => parseLocation(pathname).page === 'stream';
