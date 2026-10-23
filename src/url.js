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

export const parseURL = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);

  // global paths
  if (parts.length === 0) return { page: 'root' };
  if (parts.length === 1 && rootPages.includes(parts[0])) return { page: parts[0] };

  const dongleId = parts[0];

  // device paths
  if (parts.length > 4 || !dongleIdRegex.test(dongleId)) return { page: 'not-found' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && devicePages.includes(parts[1])) return { page: parts[1], dongleId };

  // drive paths
  if (logIdRegex.test(parts[1])) {
    const range = parseDriveRange(parts[2], parts[3]);
    return { page: 'drive', dongleId, logId: parts[1], range };
  }
  if (parts.length === 3) {
    const range = parseDriveRange(parts[1], parts[2], true);
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
