const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;

const devicePages = ['prime', 'stream', 'settings'];

function range(start, end, scale) {
  if (!numberRegex.test(start) || !numberRegex.test(end) || Number(end) <= Number(start)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

// Every page has one URL:
//   /                               root, opens the last used device
//   /referrals                      referrals
//   /:dongleId                      dashboard
//   /:dongleId/prime                prime
//   /:dongleId/stream               stream
//   /:dongleId/settings             device settings
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   drive zoomed in, in seconds
//   /:dongleId/:start/:end          legacy range in milliseconds, replaced by its drive
export function destinationFromUrl(pathname) {
  const [dongleId, page, start, end] = pathname.split('/').filter(Boolean);

  if (dongleId === 'referrals') {
    return { page: 'referrals' };
  }
  if (!dongleIdRegex.test(dongleId)) {
    return { page: 'root' };
  }
  if (devicePages.includes(page)) {
    return { page, dongleId };
  }
  if (logIdRegex.test(page)) {
    return { page: 'drive', dongleId, logId: page, zoom: range(start, end, 1000) };
  }
  const legacyRange = range(page, start, 1);
  if (legacyRange) {
    return { page: 'legacy', dongleId, zoom: legacyRange };
  }
  return { page: 'dashboard', dongleId };
}

export function urlForDestination({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (devicePages.includes(page)) {
    return `/${dongleId}/${page}`;
  }
  if (page === 'drive') {
    return zoom
      ? `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`
      : `/${dongleId}/${logId}`;
  }
  return `/${dongleId}`;
}
