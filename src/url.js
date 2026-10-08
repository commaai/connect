import { DEMO_DONGLE_ID, DEMO_PATH } from './api/demo';

const devicePattern = /^[a-f0-9]{16}$/;
const routePattern = /^[a-f0-9-]{20}$/;
const integerPattern = /^(0|[1-9]\d*)$/;
const devicePages = new Set(['prime', 'stream', 'settings', 'add-device', 'filter', 'uploads']);
const driveOverlays = new Set(['clips', 'uploads']);

function readRange(startText, endText, unit = 1) {
  if (!integerPattern.test(startText) || !integerPattern.test(endText)) return null;
  const start = Number(startText) * unit;
  const end = Number(endText) * unit;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end
    ? { start, end }
    : null;
}

// One grammar for both initial loads and subsequent history changes. Unknown paths
// have no device: they must not accidentally select a device via a regex substring.
export function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'home', dongleId: null, routeId: null, range: null };
  if (parts.length === 1 && `/${parts[0]}` === DEMO_PATH) return { page: 'drives', dongleId: DEMO_DONGLE_ID, routeId: null, range: null };
  if (parts.length === 1 && parts[0] === 'referrals') return { page: 'referrals', dongleId: null, routeId: null, range: null };
  if (parts.length === 1 && parts[0] === 'add-device') return { page: 'add-device', dongleId: null, routeId: null, range: null };
  if (!devicePattern.test(parts[0])) return { page: 'unknown', dongleId: null, routeId: null, range: null };

  const dongleId = parts[0];
  const base = { dongleId, routeId: null, range: null };
  if (parts.length === 1) return { ...base, page: 'drives' };
  if (parts.length === 2 && devicePages.has(parts[1])) return { ...base, page: parts[1] };
  if (routePattern.test(parts[1])) {
    if (parts.length === 2) return { ...base, page: 'drive', routeId: parts[1] };
    if (parts.length === 3 && driveOverlays.has(parts[2])) return { ...base, page: parts[2], routeId: parts[1] };
    const range = readRange(parts[2], parts[3], 1000);
    if (range && parts.length === 4) return { ...base, page: 'drive', routeId: parts[1], range };
    if (range && parts.length === 5 && driveOverlays.has(parts[4])) return { ...base, page: parts[4], routeId: parts[1], range };
  }
  const legacyRange = readRange(parts[1], parts[2]);
  if (parts.length === 3 && legacyRange) return { ...base, page: 'legacy-range', range: legacyRange };
  return { page: 'unknown', dongleId: null, routeId: null, range: null };
}

// Keep URL generation beside the grammar. A destination is the same shape
// returned by parsePath, so new screens have one place to define their URL.
export function urlForRoute({ page, dongleId = null, routeId = null, range = null }) {
  if (page === 'home') return '/';
  if (page === 'referrals') return '/referrals';
  if (page === 'add-device' && !dongleId) return '/add-device';
  if (!dongleId) throw new Error(`A device is required for ${page}`);

  if (routeId) {
    if (page !== 'drive' && !driveOverlays.has(page)) throw new Error(`Unknown drive page: ${page}`);
    const base = `/${dongleId}/${routeId}`;
    const ranged = range
      ? `${base}/${Math.floor(range.start / 1000)}/${Math.ceil(range.end / 1000)}`
      : base;
    return page === 'drive' ? ranged : `${ranged}/${page}`;
  }

  if (page === 'drives') return `/${dongleId}`;
  if (devicePages.has(page)) return `/${dongleId}/${page}`;
  throw new Error(`Unknown device page: ${page}`);
}

export function devicePath(dongleId, page = 'drives') {
  return urlForRoute({ page, dongleId });
}

export function drivePath(dongleId, routeId, start, end) {
  return urlForRoute({
    page: 'drive', dongleId, routeId,
    range: start == null || end == null ? null : { start, end },
  });
}
