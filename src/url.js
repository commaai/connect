const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const digitsRegex = /^\d+$/;
const secondsRegex = /^\d+(?:\.\d{1,3})?$/;
const rootPages = ['auth', 'demo', 'referrals'];

const parseDriveRange = (start, end, legacy = false) => {
  const regex = legacy ? digitsRegex : secondsRegex;
  if (!regex.test(start) || !regex.test(end)) return null;

  const multiplier = legacy ? 1 : 1000;
  const startMillis = Math.round(Number(start) * multiplier);
  const endMillis = Math.round(Number(end) * multiplier);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

const parsePathname = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  if (parts.length === 0) return { page: 'root' };
  if (parts.length === 1 && rootPages.includes(dongleId)) return { page: dongleId };
  if (!dongleIdRegex.test(dongleId) || parts.length > 4) return { page: 'not-found' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && branch === 'prime') return { page: 'prime', dongleId };
  if (parts.length === 2 && branch === 'stream') return { page: 'stream', dongleId };
  if (parts.length === 2 && logIdRegex.test(branch)) return { page: 'drive', dongleId, logId: branch, range: null };
  if (parts.length === 4 && logIdRegex.test(branch)) return { page: 'drive', dongleId, logId: branch, range: parseDriveRange(start, end) };
  if (parts.length === 3) {
    const range = parseDriveRange(branch, start, true);
    if (range) return { page: 'legacy-drive', dongleId, range };
  }
  return { page: 'not-found' };
};

export const parseURL = ({ pathname, search = '' }) => {
  const destination = parsePathname(pathname);
  const settingsDongleId = new URLSearchParams(search).get('settings');
  if (settingsDongleId) destination.settingsDongleId = settingsDongleId;

  return destination;
};
