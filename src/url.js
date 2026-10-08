const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const modalNames = new Set(['device-settings', 'add-device', 'upload-queue', 'prime-cancel', 'prime-switch', 'unpair', 'date-filter']);

function finiteRange(startValue, endValue, scale = 1) {
  if (!/^\d+$/.test(startValue) || !/^\d+$/.test(endValue)) return null;
  const start = Number(startValue) * scale;
  const end = Number(endValue) * scale;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end ? { start, end } : null;
}

export function parseRoute(input = '/') {
  const url = new URL(input, 'https://connect.invalid');
  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0] || '';
  const dongleId = dongleIdRegex.test(first) ? first : null;
  const routeId = dongleId && parts[1] && logIdRegex.test(parts[1]) ? parts[1] : null;
  const routeZoom = routeId && parts.length === 4 ? finiteRange(parts[2], parts[3], 1000) : null;
  const legacyRange = dongleId && parts.length === 3 && !routeId ? finiteRange(parts[1], parts[2]) : null;
  const zoom = routeZoom;
  const validPrime = dongleId && parts.length === 2 && parts[1] === 'prime';
  const validStream = dongleId && parts.length === 2 && parts[1] === 'stream';
  const page = url.pathname === '/referrals' ? 'referrals'
    : url.pathname === '/demo' || url.pathname.startsWith('/demo/') ? 'demo'
      : url.pathname.startsWith('/auth/') ? 'auth'
        : validPrime ? 'prime' : validStream ? 'stream'
          : routeId ? 'drive' : dongleId ? 'dashboard' : 'home';
  const requestedModal = url.searchParams.get('modal');
  const requestedDevice = url.searchParams.get('device');
  const modalDeviceId = requestedDevice
    ? (dongleIdRegex.test(requestedDevice) ? requestedDevice : null)
    : dongleId;
  const modalAllowed = page === 'prime'
    ? ['prime-cancel', 'prime-switch'].includes(requestedModal)
    : ['home', 'dashboard', 'drive'].includes(page)
      && ['device-settings', 'add-device', 'upload-queue', 'unpair', 'date-filter'].includes(requestedModal)
      && (requestedModal !== 'date-filter' || page === 'dashboard');
  const modal = modalAllowed && modalNames.has(requestedModal) && (!requestedDevice || modalDeviceId)
    && (requestedModal !== 'device-settings' && requestedModal !== 'upload-queue' && requestedModal !== 'unpair' || modalDeviceId)
    ? requestedModal : null;

  return { page, dongleId, routeId, zoom, legacyRange, modal, modalDeviceId: modal ? modalDeviceId : null };
}

export function routeModalUrl(location, modal, device) {
  const url = new URL(`${location.pathname}${location.search || ''}${location.hash || ''}`, 'https://connect.invalid');
  if (modal) url.searchParams.set('modal', modal);
  else {
    url.searchParams.delete('modal');
    url.searchParams.delete('device');
  }
  if (device) url.searchParams.set('device', device);
  else if (modal !== 'device-settings' && modal !== 'upload-queue' && modal !== 'unpair') url.searchParams.delete('device');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getDongleID(pathname) {
  return parseRoute(pathname).dongleId;
}

export function getZoom(pathname) {
  const route = parseRoute(pathname);
  return route.zoom || route.legacyRange;
}

export function getRouteId(pathname) {
  return parseRoute(pathname).routeId;
}

export function getRouteZoom(pathname) {
  return parseRoute(pathname).zoom;
}

export function getPrimeNav(pathname) {
  return parseRoute(pathname).page === 'prime';
}

export function getStreamNav(pathname) {
  return parseRoute(pathname).page === 'stream';
}
