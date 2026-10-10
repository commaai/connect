const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const digitsRegex = /^\d+$/;
const secondsRegex = /^\d+(?:\.\d{1,3})?$/;

const parseDriveRange = (start, end, legacy = false) => {
  const regex = legacy ? digitsRegex : secondsRegex;
  if (!regex.test(start) || !regex.test(end)) return null;

  const multiplier = legacy ? 1 : 1000;
  const startMillis = Math.round(Number(start) * multiplier);
  const endMillis = Math.round(Number(end) * multiplier);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
}

const parsePathname = (pathname) => {
  const rootPages = ['auth', 'demo', 'referrals'];
  const devicePages = ['prime', 'stream'];

  const parts = pathname.split('/').filter(Boolean);

  if (!parts.length) return { page: 'root' };
  if (parts.length === 1 && rootPages.includes(parts[0])) return { page: parts[0] };

  const [dongleId, branch, start, end, ...rest] = parts;
  if (!dongleIdRegex.test(dongleId) || rest.length) return { page: 'not-found' };
  if (!branch) return { page: 'dashboard', dongleId };
  if (!start && devicePages.includes(branch)) return { page: branch, dongleId };

  if (logIdRegex.test(branch) && (!start || end)) {
    const range = end ? parseDriveRange(start, end) : null;
    return { page: 'drive', dongleId, logId: branch, range };
  }
  if (start && !end) {
    const range = parseDriveRange(branch, start, true);
    if (range) return { page: 'legacy-drive', dongleId, range };
  }
  return { page: 'not-found' };
}

export const parseURL = ({ pathname, search = '' }) => {
  const destination = parsePathname(pathname);
  const params = new URLSearchParams(search);

  // optional query params
  const settingsDongleId = params.get('settings');
  if (settingsDongleId) destination.settingsDongleId = settingsDongleId;

  return destination;
}
