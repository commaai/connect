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

export const buildURL = (destination) => {
  const { page, dongleId, logId, range } = destination;
  if (rootPages.includes(page)) return `/${page}`;

  const basePath = dongleId ? `/${dongleId}` : '/';
  if (page === 'dashboard' || page === 'root' || page === 'not-found') return basePath;

  if (!dongleId) return;

  if (page === 'drive') {
    if (!range) return `${basePath}/${logId}`;
    return `${basePath}/${logId}/${Math.floor(range.start / 1000)}/${Math.floor(range.end / 1000)}`;
  }

  if (devicePages.includes(page)) return `${basePath}/${page}`;
};
