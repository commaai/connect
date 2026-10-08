const DONGLE_ID = /^[0-9a-f]{16}$/;
const LOG_ID = /^[0-9a-f-]{20}$/;
const NUMBER = /^\d+(\.\d+)?$/;

export const DEVICE_PAGES = ['prime', 'stream'];
export const MODALS = [
  'settings', 'pair', 'filter', 'files', 'info', 'uploads', 'settings-uploads',
  'unpair', 'clips', 'clip', 'delete-clip', 'switch-prime', 'cancel-prime',
];

const emptyNav = {
  page: 'home',
  dongleId: null,
  logId: null,
  zoom: null,
  legacyRange: null,
  modal: null,
  clip: null,
};

function range(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  start = Math.round(Number(start) * scale);
  end = Math.round(Number(end) * scale);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end ? { start, end } : null;
}

function parsePath(parts) {
  if (parts.length === 1 && parts[0] === 'referrals') {
    return { page: 'referrals' };
  }
  const [dongleId, ...rest] = parts;
  if (!DONGLE_ID.test(dongleId)) {
    return {};
  }
  if (rest.length === 1 && DEVICE_PAGES.includes(rest[0])) {
    return { page: rest[0], dongleId };
  }
  if (LOG_ID.test(rest[0])) {
    return { page: 'drive', dongleId, logId: rest[0], zoom: range(rest[1], rest[2], 1000) };
  }
  return { page: 'dashboard', dongleId, legacyRange: range(rest[0], rest[1], 1) };
}

export function parseLocation({ pathname, search = '' }) {
  const query = new URLSearchParams(search);
  const modal = query.get('modal');
  const clip = query.get('clip');
  return {
    ...emptyNav,
    ...parsePath(pathname.split('/').filter(Boolean)),
    modal: MODALS.includes(modal) ? modal : null,
    clip: ['clip', 'delete-clip'].includes(modal) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(clip || '') ? clip : null,
  };
}

function buildPath({ page, dongleId, logId, zoom }) {
  if (page === 'referrals' || !dongleId) {
    return page === 'referrals' ? '/referrals' : '/';
  }
  if (DEVICE_PAGES.includes(page)) {
    return `/${dongleId}/${page}`;
  }
  if (page === 'drive') {
    const seconds = zoom ? `/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}` : '';
    return `/${dongleId}/${logId}${seconds}`;
  }
  return `/${dongleId}`;
}

export function urlFor(nav) {
  const path = buildPath(nav);
  const query = new URLSearchParams(nav.search);
  if (nav.modal) query.set('modal', nav.modal);
  else query.delete('modal');
  if (['clip', 'delete-clip'].includes(nav.modal) && nav.clip) query.set('clip', nav.clip);
  else query.delete('clip');
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
