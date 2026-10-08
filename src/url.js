// Every URL the app understands, in one place.
//
//   /                                    home
//   /referrals                           referrals
//   /:dongleId                           a device's drives
//   /:dongleId/prime                     Prime
//   /:dongleId/stream                    live stream
//   /:dongleId/settings                  device settings
//   /:dongleId/:routeId                  a drive
//   /:dongleId/:routeId/:start/:end      a drive, zoomed to a range (seconds)
//   /:dongleId/:startMs/:endMs           legacy link to a time range, resolved to a drive
//
// parseUrl turns a pathname into a destination and buildUrl turns a destination back into a
// pathname. Nothing else should split or assemble paths.
//
// A destination is { page, dongleId, routeId, range }:
//   page      'home' | 'referrals' | 'device' | 'prime' | 'stream' | 'settings' | 'drive' | 'legacyRange'
//   dongleId  null on pages that don't belong to a device
//   routeId   drive pages only
//   range     { start, end } in milliseconds; for 'drive' within the drive (or null for all of it),
//             for 'legacyRange' epoch milliseconds

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;

const DEVICE_PAGES = ['prime', 'stream', 'settings'];

export function parseUrl(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (first === 'referrals' && second === undefined) {
    return { page: 'referrals', dongleId: null };
  }
  if (!DONGLE_ID.test(first)) {
    return { page: 'home', dongleId: null };
  }

  const dongleId = first;
  if (second === undefined) {
    return { page: 'device', dongleId };
  }
  if (DEVICE_PAGES.includes(second) && third === undefined) {
    return { page: second, dongleId };
  }
  if (ROUTE_ID.test(second)) {
    const hasRange = NUMBER.test(third) && NUMBER.test(fourth);
    return {
      page: 'drive',
      dongleId,
      routeId: second,
      range: hasRange ? { start: Number(third) * 1000, end: Number(fourth) * 1000 } : null,
    };
  }
  if (NUMBER.test(second) && NUMBER.test(third)) {
    return { page: 'legacyRange', dongleId, range: { start: Number(second), end: Number(third) } };
  }
  return { page: 'device', dongleId };
}

export function buildUrl({ page, dongleId, routeId, range }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  if (DEVICE_PAGES.includes(page)) {
    return `/${dongleId}/${page}`;
  }
  if (page === 'drive') {
    return range
      ? `/${dongleId}/${routeId}/${Math.floor(range.start / 1000)}/${Math.floor(range.end / 1000)}`
      : `/${dongleId}/${routeId}`;
  }
  if (page === 'legacyRange') {
    return `/${dongleId}/${range.start}/${range.end}`;
  }
  return `/${dongleId}`;
}

// A drive, or a range of one, can be opened without logging in.
export function isShareable({ page }) {
  return page === 'drive' || page === 'legacyRange';
}
