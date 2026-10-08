const dongleIdPattern = /^[a-f0-9]{16}$/;
const routeIdPattern = /^[a-f0-9-]{20}$/;
const modalNames = new Set(['settings', 'uploads', 'pair', 'filter']);
const demoDongleId = 'deadbeefdeadbeef';

export function sameOriginPath(value) {
  if (!value) return null;
  try {
    const requested = new URL(value, window.location.origin);
    return requested.origin === window.location.origin
      ? `${requested.pathname}${requested.search}${requested.hash}`
      : null;
  } catch {
    return null;
  }
}

function getLocation(location) {
  if (typeof location === 'string') {
    const parsed = new URL(location, window.location.origin);
    return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash };
  }
  return location || window.location;
}

export function parseUrl(location) {
  const { pathname, search } = getLocation(location);
  const parts = pathname.split('/').filter(Boolean);
  const demoPath = parts[0] === 'demo';
  const pathParts = demoPath ? parts.slice(1) : parts;
  const dongleId = demoPath ? demoDongleId : (dongleIdPattern.test(pathParts[0] || '') ? pathParts[0] : null);
  const partsAfterDevice = dongleId ? (demoPath ? pathParts : pathParts.slice(1)) : [];
  let page = pathname === '/referrals' ? 'referrals' : 'home';
  let routeId = null;
  let zoom = null;
  let legacyRange = null;

  if (dongleId) {
    page = demoPath && partsAfterDevice.length === 0 ? 'demo' : 'dashboard';
    if (partsAfterDevice.length === 1 && partsAfterDevice[0] === 'prime') {
      page = 'prime';
    } else if (partsAfterDevice.length === 1 && partsAfterDevice[0] === 'stream') {
      page = 'stream';
    } else if (routeIdPattern.test(partsAfterDevice[0] || '') && [1, 3].includes(partsAfterDevice.length)) {
      routeId = partsAfterDevice[0];
      page = 'drive';
      if (partsAfterDevice.length === 3) {
        const start = Number(partsAfterDevice[1]);
        const end = Number(partsAfterDevice[2]);
        if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end) {
          zoom = { start: start * 1000, end: end * 1000 };
        } else {
          routeId = null;
          page = 'dashboard';
        }
      }
    } else if (partsAfterDevice.length === 2 && /^\d+$/.test(partsAfterDevice[0]) && /^\d+$/.test(partsAfterDevice[1])) {
      const start = Number(partsAfterDevice[0]);
      const end = Number(partsAfterDevice[1]);
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end) {
        legacyRange = { start, end };
        page = 'legacy';
      }
    }
  }

  const params = new URLSearchParams(search || '');
  const requestedModal = params.get('modal');
  const modal = modalNames.has(requestedModal) ? requestedModal : null;
  const targetDeviceId = modal && dongleIdPattern.test(params.get('device') || '')
    ? params.get('device')
    : null;

  return {
    page,
    dongleId,
    routeId,
    zoom,
    legacyRange,
    modal,
    targetDeviceId,
  };
}

export function buildUrl(url, currentLocation) {
  const location = getLocation(currentLocation);
  const params = new URLSearchParams(location.search || '');
  const parts = [];
  const demoPath = location.pathname === '/demo' || location.pathname.startsWith('/demo/');

  if (url.page === 'drive' && url.routeId) {
    parts.push(url.routeId);
    if (url.zoom?.start != null && url.zoom?.end != null) {
      parts.push(Math.floor(url.zoom.start / 1000), Math.ceil(url.zoom.end / 1000));
    }
  } else if (url.page === 'prime' || url.page === 'stream') {
    parts.push(url.page);
  }

  let pathname = location.pathname || '/';
  if (url.page === 'demo' || (demoPath && url.dongleId === demoDongleId && ['dashboard', 'drive', 'prime', 'stream'].includes(url.page))) {
    pathname = `/demo${parts.length ? `/${parts.join('/')}` : ''}`;
  } else if (url.page === 'dashboard' || url.page === 'drive' || url.page === 'prime' || url.page === 'stream') {
    pathname = `/${url.dongleId}${parts.length ? `/${parts.join('/')}` : ''}`;
  } else if (url.page === 'home') {
    pathname = '/';
  } else if (url.page === 'referrals') {
    pathname = '/referrals';
  }

  if (modalNames.has(url.modal)) params.set('modal', url.modal);
  else params.delete('modal');
  if (url.targetDeviceId && ['settings', 'uploads'].includes(url.modal)) {
    params.set('device', url.targetDeviceId);
  } else {
    params.delete('device');
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${location.hash || ''}`;
}
