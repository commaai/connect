const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const digitsRegex = /^\d+$/;
const secondsRegex = /^\d+(?:\.\d{1,3})?$/;

const parseDriveRange = (start, end, legacy = false) => {
  const regex = legacy ? digitsRegex : secondsRegex;
  if (!regex.test(start) || !regex.test(end)) return null;
  const startMillis = legacy ? Number(start) : Math.round(Number(start) * 1000);
  const endMillis = legacy ? Number(end) : Math.round(Number(end) * 1000);
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
      path.push(range.start / 1000, range.end / 1000);
    }
  }

  return `/${path.join('/')}`;
}
