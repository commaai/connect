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

const rootRoutes = ['auth', 'demo', 'referrals'];
const deviceRoutes = ['prime', 'stream'];

export const parseURL = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);

  if (!parts.length) return { page: 'root' };
  if (parts.length === 1 && rootRoutes.includes(parts[0])) return { page: parts[0] };

  const [dongleId, branch, start, end, ...rest] = parts;
  if (!dongleIdRegex.test(dongleId) || rest.length) return { page: 'not-found' };
  if (!branch) return { page: 'dashboard', dongleId };
  if (!start && deviceRoutes.includes(branch)) return { page: branch, dongleId };

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
