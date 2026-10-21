import { api } from './api/backend';

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const digitsRegex = /^\d+$/;
const rootPages = ['auth', 'demo', 'referrals'];
const devicePages = ['prime', 'stream', 'settings'];

const parseDriveRange = (start, end, legacy = false) => {
  if (!digitsRegex.test(start) || !digitsRegex.test(end)) return null;

  const multiplier = legacy ? 1 : 1000;
  const startMillis = Number(start) * multiplier;
  const endMillis = Number(end) * multiplier;
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

export const parseURL = (location) => {
  const parts = location.pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  if (parts.length === 0) return { page: 'root' };
  if (parts.length === 1 && rootPages.includes(parts[0])) return { page: parts[0] };
  if (parts.length > 4 || !dongleIdRegex.test(dongleId)) return { page: 'not-found' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && devicePages.includes(branch)) return { page: branch, dongleId };
  if (logIdRegex.test(branch)) return { page: 'drive', dongleId, logId: branch, range: parseDriveRange(start, end) };
  if (parts.length === 3) {
    const range = parseDriveRange(branch, start, true);
    if (range) return { page: 'legacy-drive', dongleId, range };
  }
  return { page: 'not-found' };
};

export const resolveURL = async (state) => {
  let route = parseURL(state.router.location);
  let pathname = state.router.location.pathname;
  const dongleId = route.dongleId ?? state.dongleId ?? state.devices[0]?.dongle_id ?? null;

  if (route.page === 'legacy-drive') {
    const logId = await api.routes.getRoutesSegments(dongleId, route.range.start, route.range.end)
      .then((routes) => routes?.[0]?.fullname?.split('|')[1])
      .catch((err) => console.error('Failed to resolve legacy drive URL', err));
    if (logId) route = { page: 'drive', logId, range: null };
  }

  if (route.page === 'not-found') {
    pathname = dongleId ? `/${dongleId}` : '/';
  } else if (route.page === 'root' && dongleId) {
    pathname = `/${dongleId}`;
  } else if (route.page === 'drive' && !route.range) {
    pathname = `/${dongleId}/${route.logId}`;
  }

  return { ...route, dongleId, pathname };
};
