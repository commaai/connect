// Every URL connect understands. parseUrl() reads one, the *Url() helpers
// write one, and nothing else in the app looks at a pathname.
//
//   /                                home: redirects to the selected device
//   /referrals                       referrals
//   /:dongleId                       device dashboard
//   /:dongleId/prime                 comma prime
//   /:dongleId/stream                live stream
//   /:dongleId/:logId                drive
//   /:dongleId/:logId/:start/:end    drive, zoomed to [start, end] in seconds
//   /:dongleId/:start/:end           old link to a time range in ms, opens its drive
//
// Dialogs open over any page with a query argument:
//
//   ?settings=:dongleId              device settings

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;

function parseRange(start, end, scale) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

// zoom is in milliseconds from the start of the drive, legacyRange in absolute milliseconds
export function parseUrl({ pathname, search = '' }) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second, third, fourth] = parts;
  const settings = new URLSearchParams(search).get('settings');
  const url = {
    page: 'home',
    dongleId: null,
    logId: null,
    zoom: null,
    legacyRange: null,
    settings: DONGLE_ID.test(settings) ? settings : null,
  };

  if (parts.length === 1 && dongleId === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!DONGLE_ID.test(dongleId)) {
    return url;
  }
  if (parts.length === 2 && (second === 'prime' || second === 'stream')) {
    return { ...url, page: second, dongleId };
  }
  if (LOG_ID.test(second)) {
    return { ...url, page: 'drive', dongleId, logId: second, zoom: parseRange(third, fourth, 1000) };
  }
  if (parts.length === 3 && parseRange(second, third, 1)) {
    return { ...url, page: 'legacy', dongleId, legacyRange: parseRange(second, third, 1) };
  }
  return { ...url, page: 'dashboard', dongleId };
}

export function currentUrl(state) {
  return parseUrl(state.router.location);
}

export const REFERRALS_URL = '/referrals';

export function deviceUrl(dongleId) {
  return dongleId ? `/${dongleId}` : '/';
}

export function primeUrl(dongleId) {
  return `/${dongleId}/prime`;
}

export function streamUrl(dongleId) {
  return `/${dongleId}/stream`;
}

// widen the zoom to whole seconds so the URL range always covers it
export function driveUrl(dongleId, logId, zoom = null) {
  const range = zoom ? `/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}` : '';
  return `/${dongleId}/${logId}${range}`;
}

// the current page with the settings dialog opened for a device, or closed
export function settingsUrl({ pathname, search }, dongleId) {
  const params = new URLSearchParams(search);
  if (dongleId) {
    params.set('settings', dongleId);
  } else {
    params.delete('settings');
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
