// Route tree:
// /                          root: remembered or first device
// ├── auth | demo | referrals
// └── :dongleId              dashboard
//     ├── prime | stream | settings
//     ├── :logId             drive
//     │   └── :start/:end    drive range, in seconds
//     └── :startMs/:endMs    legacy drive, resolved to its log id
const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const integerRegex = /^\d+$/;
const ROOT_PAGES = ['auth', 'demo', 'referrals'];
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

function parseRange(start, end, unit) {
  if (!integerRegex.test(start) || !integerRegex.test(end)) return null;
  const range = { start: Number(start) * unit, end: Number(end) * unit };
  return Number.isSafeInteger(range.end) && range.end > range.start ? range : null;
}

export function destinationFromUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  if (parts.length === 0) return { page: 'root' };
  if (parts.length === 1 && ROOT_PAGES.includes(dongleId)) return { page: dongleId };
  if (!dongleIdRegex.test(dongleId)) return { page: 'not-found' };
  if (parts.length === 1) return { page: 'dashboard', dongleId };
  if (parts.length === 2 && DEVICE_PAGES.includes(branch)) return { page: branch, dongleId };
  if (logIdRegex.test(branch) && (parts.length === 2 || parts.length === 4)) {
    return { page: 'drive', dongleId, logId: branch, range: parts.length === 4 ? parseRange(start, end, 1000) : null };
  }
  if (parts.length === 3) {
    const range = parseRange(branch, start, 1);
    if (range) return { page: 'legacy-drive', dongleId, range };
  }
  return { page: 'not-found' };
}

export function urlForDestination({ page, dongleId, logId, range }) {
  if (ROOT_PAGES.includes(page)) return `/${page}`;
  if (!dongleId) return '/';
  if (page === 'drive') {
    const rangePath = range ? `/${Math.floor(range.start / 1000)}/${Math.ceil(range.end / 1000)}` : '';
    return `/${dongleId}/${logId}${rangePath}`;
  }
  return DEVICE_PAGES.includes(page) ? `/${dongleId}/${page}` : `/${dongleId}`;
}
