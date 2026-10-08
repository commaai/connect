import { DEMO_DONGLE_ID } from './api/demo';

const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^[a-f0-9-]{20}$/;
const secondsRegex = /^\d+(\.\d{1,3})?$/;

// seconds may carry up to 3 decimals (ms precision); parse digit-wise to
// avoid float drift like Number('10.5') * 1000.
const parseSeconds = (value) => {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
};

const rangeFromParts = (start, end, scale) => {
  const startMillis = scale === 1000 ? parseSeconds(start) : Number(start);
  const endMillis = scale === 1000 ? parseSeconds(end) : Number(end);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

// ms -> '10.5' style seconds, capped at the 3 decimals the parser accepts.
const emitSeconds = (ms) => {
  const rounded = Math.round(ms);
  const whole = Math.trunc(rounded / 1000);
  const frac = Math.abs(rounded % 1000);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
};

// Modal overlays live in the query string so they can sit on top of any page
// (a drive's range stays put underneath ?modal=settings) and so settings for
// another device (?modal=settings&device=…) don't switch the selected device.
export const MODAL_PAGES = {
  settings: ['dashboard', 'drive'],
};

// Route tree:
// /
// ├── demo/:logId?
// ├── referrals
// └── :dongleId
//     ├── (dashboard)
//     ├── settings   (legacy form, canonicalizes to ?modal=settings)
//     ├── prime
//     ├── stream
//     ├── :logId
//     │   └── :startSeconds/:endSeconds
//     └── :startMillis/:endMillis  (legacy, resolves to a canonical drive URL)
export function destinationFromUrl(location) {
  const pathname = typeof location === 'string' ? location : location?.pathname;
  const search = typeof location === 'string' ? '' : location?.search;
  const parts = (pathname || '').split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  let destination = { kind: 'not-found' };
  if (parts.length === 0) {
    destination = { kind: 'root' };
  } else if (parts[0] === 'auth') {
    // auth callback intermediates live outside the app state model
    destination = { kind: 'auth' };
  } else if (dongleId === 'demo') {
    if (parts.length === 1) destination = { kind: 'demo' };
    else if (parts.length === 2 && exactLogIdRegex.test(branch)) {
      destination = { kind: 'drive', dongleId: DEMO_DONGLE_ID, drive: { logId: branch, start: null, end: null } };
    } else if (parts.length === 4 && exactLogIdRegex.test(branch)
        && secondsRegex.test(start) && secondsRegex.test(end)) {
      const range = rangeFromParts(start, end, 1000);
      destination = { kind: 'drive', dongleId: DEMO_DONGLE_ID, drive: { logId: branch, start: range?.start ?? null, end: range?.end ?? null } };
    }
  } else if (parts.length === 1 && dongleId === 'referrals') {
    destination = { kind: 'referrals' };
  } else if (exactDongleIdRegex.test(dongleId)) {
    if (parts.length === 1) destination = { kind: 'dashboard', dongleId };
    else if (parts.length === 2 && ['settings', 'prime', 'stream'].includes(branch)) {
      destination = { kind: branch, dongleId };
    } else if (parts.length === 2 && exactLogIdRegex.test(branch)) {
      destination = { kind: 'drive', dongleId, drive: { logId: branch, start: null, end: null } };
    } else if (parts.length === 4 && exactLogIdRegex.test(branch)
        && secondsRegex.test(start) && secondsRegex.test(end)) {
      const range = rangeFromParts(start, end, 1000);
      destination = { kind: 'drive', dongleId, drive: { logId: branch, start: range?.start ?? null, end: range?.end ?? null } };
    } else if (parts.length === 3 && /^\d+$/.test(branch) && /^\d+$/.test(start)) {
      const range = rangeFromParts(branch, start, 1);
      if (range) destination = { kind: 'legacy', dongleId, ...range };
    }
  }

  const page = { demo: 'dashboard', root: 'dashboard' }[destination.kind] ?? destination.kind;
  if (page !== 'not-found' && page !== 'auth' && page !== 'legacy' && page !== 'settings') {
    const params = new URLSearchParams(search || '');
    const modal = params.get('modal');
    if (modal && params.getAll('modal').length === 1 && MODAL_PAGES[modal]?.includes(page)) {
      destination.modal = modal;
      const device = params.get('device');
      if (device && params.getAll('device').length === 1 && exactDongleIdRegex.test(device)) {
        destination.modalDevice = device;
      }
    }
  }
  return destination;
}

export function urlForDestination(destination) {
  if (destination?.page === 'referrals') return '/referrals';
  if (!destination?.dongleId) return '/';
  const demo = destination.dongleId === DEMO_DONGLE_ID;
  const path = [demo ? 'demo' : destination.dongleId];
  if (destination.page === 'prime' || destination.page === 'stream') {
    path.push(destination.page);
  }
  if (destination.drive?.logId) {
    path.push(destination.drive.logId);
    if (destination.drive.start != null && destination.drive.end != null) {
      path.push(emitSeconds(destination.drive.start), emitSeconds(destination.drive.end));
    }
  }
  let url = `/${path.join('/')}`;
  if (destination.modal) {
    const params = new URLSearchParams();
    params.set('modal', destination.modal);
    if (destination.modalDevice && destination.modalDevice !== destination.dongleId) {
      params.set('device', destination.modalDevice);
    }
    url += `?${params.toString()}`;
  }
  return url;
}
