// Every URL connect understands, and the only place that reads or builds one.
//
//   /                              -> home (selects a device)
//   /:dongleId                     -> device
//   /:dongleId/prime               -> prime management
//   /:dongleId/stream              -> teleop stream
//   /:dongleId/:logId              -> whole drive
//   /:dongleId/:logId/:start/:end  -> drive range, in seconds
//   /:dongleId/:start/:end         -> legacy timestamp range (ms), resolved to a drive on load
//   /referrals                     -> referrals
//   ?modal=:name[&device=:id]      -> a dialog over any page, see MODALS

const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;

// Dialogs that belong to one device carry its id as &device=
export const DEVICE_MODALS = ['settings', 'unpair', 'uploads'];
const MODALS = [...DEVICE_MODALS, 'date', 'pair', 'prime-cancel', 'prime-switch'];

export function parseUrl(pathname = '/', search = '') {
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;
  const query = new URLSearchParams(search);
  const modal = MODALS.includes(query.get('modal')) ? query.get('modal') : null;
  const url = {
    page: 'home',
    dongleId: null,
    logId: null,
    range: null, // seconds into the drive, or null for the whole drive
    legacyRange: null, // absolute timestamps, only without a logId
    modal,
    modalDongleId: DEVICE_MODALS.includes(modal) && dongleIdRegex.test(query.get('device')) ? query.get('device') : null,
  };

  if (first === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!dongleIdRegex.test(first)) {
    return url;
  }

  url.dongleId = first;
  url.page = 'device';
  if (parts.length === 2 && (second === 'prime' || second === 'stream')) {
    url.page = second;
  } else if (logIdRegex.test(second)) {
    url.page = 'drive';
    url.logId = second;
    if (parts.length >= 4) {
      url.range = { start: Number(third), end: Number(fourth) };
    }
  } else if (parts.length >= 3) {
    url.legacyRange = { start: Number(second), end: Number(third) };
  }
  return url;
}

export function buildUrl({ page = 'device', dongleId, logId, range, modal, modalDongleId } = {}) {
  let path = '/';
  if (page === 'referrals') {
    path = '/referrals';
  } else if (dongleId) {
    path = `/${dongleId}`;
    if (page === 'prime' || page === 'stream') {
      path += `/${page}`;
    } else if (logId) {
      path += `/${logId}`;
      if (range) {
        path += `/${range.start}/${range.end}`;
      }
    }
  }
  if (!modal) {
    return path;
  }
  const query = new URLSearchParams({ modal });
  if (modalDongleId) {
    query.set('device', modalDongleId);
  }
  return `${path}?${query}`;
}

// The current page with a modal opened, or closed when modal is null.
export function withModal({ pathname, search }, modal, modalDongleId) {
  const current = parseUrl(pathname, search);
  return buildUrl({ ...current, modal, modalDongleId });
}
