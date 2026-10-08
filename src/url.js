const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const digitsRegex = /^\d+$/;

const parseDriveRange = (start, end, legacy = false) => {
  if (!digitsRegex.test(start) || !digitsRegex.test(end)) return null;
  const startMillis = Number(start) * (legacy ? 1 : 1000);
  const endMillis = Number(end) * (legacy ? 1 : 1000);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
}

export const parseURL = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'root' };
  if (parts.length === 1 && ['auth', 'demo', 'referrals'].includes(parts[0])) return { page: parts[0] };

  const [dongleId, branch, start, end] = parts;
  if (!dongleIdRegex.test(dongleId)) return { page: 'not-found' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && ['prime', 'stream'].includes(branch)) return { page: branch, dongleId };

  if (logIdRegex.test(branch) && (parts.length === 2 || parts.length === 4)) {
    const range = parts.length === 4 ? parseDriveRange(start, end) : null;
    return { page: 'drive', dongleId, logId: branch, range };
  }
  if (parts.length === 3) {
    const range = parseDriveRange(branch, start, true);
    if (range) return { page: 'legacy-drive', dongleId, range };
  }
  return { page: 'not-found' };
}

export const buildURL = (destination) => {
  const { page, dongleId, logId, range } = destination;

  if (['auth', 'demo', 'referrals'].includes(page)) return `/${page}`;
  if (page === 'root' || !dongleId) return '/';

  const path = [dongleId];
  if (['prime', 'stream'].includes(page)) path.push(page);

  if (page === 'drive') {
    path.push(logId);
    if (range?.start != null && range?.end != null) {
      path.push(Math.floor(range.start / 1000), Math.floor(range.end / 1000));
    }
  }

  return `/${path.join('/')}`;
}

export function getDongleID(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (!dongleIdRegex.test(parts[0])) {
    return null;
  }

  return parts[0] || null;
}

export function getZoom(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);
  if (parts.length >= 3 && parts[0] !== 'auth') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getRouteId(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 2 && logIdRegex.test(parts[1])) {
    return parts[1];
  }
  return null;
}

export function getRouteZoom(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (getRouteId(pathname) && parts.length >= 4) {
    return {
      start: Number(parts[2]) * 1000,
      end: Number(parts[3]) * 1000,
    };
  }
  return null;
}

export function getPrimeNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'prime') {
    return true;
  }
  return false;
}

export function getStreamNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'stream') {
    return true;
  }
  return false;
}
