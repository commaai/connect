// The URL is the source of truth for where the user is in the app. This file
// is the only place that knows how a pathname maps to a location and back.
//
//   /                               home, picks a device
//   /referrals                      referrals
//   /:dongleId                      device dashboard
//   /:dongleId/prime                comma prime
//   /:dongleId/stream               live stream
//   /:dongleId/settings             device settings
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   drive, zoomed to [start, end] in seconds
//   /:dongleId/:start/:end          legacy timestamp range in ms, resolved to a drive
//
// A location is { page, dongleId, logId, zoom }, with zoom in milliseconds
// relative to the start of the drive (or absolute ms for 'legacyRange').

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20,}$/;
const NUMBER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream', 'settings'];

const location = (page, dongleId = null, logId = null, zoom = null) => ({ page, dongleId, logId, zoom });

export function parseUrl(pathname) {
  const [first, second, third, fourth] = pathname.split('/').filter(Boolean);

  if (!DONGLE_ID.test(first)) {
    return location(first === 'referrals' ? 'referrals' : 'home');
  }
  const dongleId = first;

  if (DEVICE_PAGES.includes(second) && third === undefined) {
    return location(second, dongleId);
  }

  if (LOG_ID.test(second)) {
    const [start, end] = [Number(third) * 1000, Number(fourth) * 1000];
    const zoom = NUMBER.test(third) && NUMBER.test(fourth) && end > start ? { start, end } : null;
    return location('drive', dongleId, second, zoom);
  }

  if (NUMBER.test(second) && NUMBER.test(third)) {
    return location('legacyRange', dongleId, null, { start: Number(second), end: Number(third) });
  }

  return location('dashboard', dongleId);
}

export function buildUrl({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') {
    return '/referrals';
  }
  if (!dongleId) {
    return '/';
  }
  switch (page) {
    case 'dashboard':
      return `/${dongleId}`;
    case 'prime':
    case 'stream':
    case 'settings':
      return `/${dongleId}/${page}`;
    case 'drive': {
      // widen to whole seconds so the URL range always covers the selection
      const range = zoom ? `/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}` : '';
      return `/${dongleId}/${logId}${range}`;
    }
    default:
      return '/';
  }
}

// Pages that can be viewed without signing in, as long as the route is public.
export function isPublicPage(page) {
  return page === 'drive' || page === 'legacyRange';
}
