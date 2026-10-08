const dongleIdRegex = /^[a-f0-9]{16}$/;

const logIdRegex = /^[a-f0-9-]{20}$/;

const secondsRegex = /^\d+$/;

const DEVICE_PAGES = ['prime', 'stream', 'settings'];

export function parseLocation(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second, start, end] = parts;

  if (parts.length === 1 && dongleId === 'referrals') {
    return { page: 'referrals' };
  }

  if (!dongleIdRegex.test(dongleId)) {
    return { page: 'home' };
  }

  if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
    return { page: second, dongleId };
  }

  if (logIdRegex.test(second)) {
    if (parts.length === 2) {
      return { page: 'drive', dongleId, logId: second, start: null, end: null };
    }

    const isRange = parts.length === 4 && secondsRegex.test(start) && secondsRegex.test(end) && Number(start) < Number(end);

    if (isRange) {
      return { page: 'drive', dongleId, logId: second, start: Number(start) * 1000, end: Number(end) * 1000 };
    }
  }

  return { page: 'dash', dongleId };
}

export function buildUrl(location) {
  const { page, dongleId, logId, start, end } = location;

  if (page === 'home') {
    return '/';
  }

  if (page === 'referrals') {
    return '/referrals';
  }

  if (page === 'dash') {
    return `/${dongleId}`;
  }

  if (page === 'drive') {
    const range = start === null ? '' : `/${Math.floor(start / 1000)}/${Math.floor(end / 1000)}`;

    return `/${dongleId}/${logId}${range}`;
  }

  return `/${dongleId}/${page}`;
}

export const selectLocation = (state) => parseLocation(state.router.location.pathname);
