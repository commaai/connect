const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const globalModalNames = new Set(['device-settings', 'add-device', 'upload-queue', 'unpair']);
const primeModalNames = new Set(['prime-cancel', 'prime-switch']);
const clipModalNames = new Set(['clips', 'clip-viewer', 'clip-delete']);
const clipTargetModalNames = new Set(['clip-viewer', 'clip-delete']);
const deviceTargetModalNames = new Set(['device-settings', 'upload-queue', 'unpair']);
const clipFilenameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

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
  const validPrime = dongleId && parts.length === 2 && parts[1] === 'prime';
  const validStream = dongleId && parts.length === 2 && parts[1] === 'stream';
  const page = url.pathname === '/referrals' ? 'referrals'
    : url.pathname === '/demo' || url.pathname.startsWith('/demo/') ? 'demo'
      : url.pathname.startsWith('/auth/') ? 'auth'
        : validPrime ? 'prime' : validStream ? 'stream'
          : routeId ? 'drive' : dongleId ? 'dashboard' : 'home';
  const requestedModal = url.searchParams.get('modal');
  const clipModal = clipModalNames.has(requestedModal);
  const requestedDevice = clipModal ? null : url.searchParams.get('device');
  const modalDeviceId = requestedDevice
    ? (dongleIdRegex.test(requestedDevice) ? requestedDevice : null)
    : dongleId;
  const requestedClip = url.searchParams.get('clip');
  const normalizedClip = requestedClip?.trim().replace(/\.mp4$/i, '');
  const validClip = Boolean(normalizedClip && clipFilenameRegex.test(normalizedClip));
  const clipAllowed = clipModal && (page === 'dashboard' || page === 'drive') && Boolean(dongleId)
    && (!clipTargetModalNames.has(requestedModal) || validClip);
  const modalAllowed = clipAllowed
    || (requestedModal === 'date-filter' && (page === 'dashboard' || page === 'demo'))
    || (primeModalNames.has(requestedModal) && page === 'prime')
    || (globalModalNames.has(requestedModal) && page !== 'auth' && page !== 'demo');
  const needsDevice = deviceTargetModalNames.has(requestedModal);
  const modal = modalAllowed && (!requestedDevice || modalDeviceId) && (!needsDevice || modalDeviceId)
    ? requestedModal : null;

  return {
    page,
    dongleId,
    routeId,
    zoom: routeZoom,
    legacyRange,
    modal,
    modalDeviceId: modal ? modalDeviceId : null,
    routeModalClip: modal && clipTargetModalNames.has(modal) ? requestedClip : null,
  };
}

export function routeModalUrl(location, modal, device, clip) {
  const url = new URL(`${location.pathname}${location.search || ''}${location.hash || ''}`, 'https://connect.invalid');
  url.searchParams.delete('clip');
  if (modal) url.searchParams.set('modal', modal);
  else {
    url.searchParams.delete('modal');
    url.searchParams.delete('device');
  }
  if (device) url.searchParams.set('device', device);
  else if (modal !== 'device-settings' && modal !== 'upload-queue' && modal !== 'unpair') url.searchParams.delete('device');
  if (clip) url.searchParams.set('clip', clip);
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
