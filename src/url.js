import { stringifyQuery } from './utils/query';

// URL grammar. Paths name pages; ?modal names an overlay on top of the page.
//
// /                                      root: replace with remembered or first device
// /demo                                  root, on the demo backend
// /auth/...                              OAuth callback, handled by App before routing
// /referrals                             referrals
// /:dongleId                             dashboard
// /:dongleId/prime                       prime
// /:dongleId/stream                      stream
// /:dongleId/:logId                      drive
// /:dongleId/:logId/:startSec/:endSec    drive, zoomed
// /:dongleId/:startMs/:endMs             legacy drive link, replaced once resolved
//
// ?modal=settings|add-device|uploads     overlay; &device=:dongleId targets another device
// history.location.state.inApp marks a modal opened in-app, so closing it goes back.
// Other query params (r, pair, stripe_*, ci) aren't navigation: parse ignores them.

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const NUMBER = /^\d+$/;
const MODALS = ['settings', 'add-device', 'uploads'];

function range(start, end, scale) {
  if (!NUMBER.test(start) || !NUMBER.test(end) || Number(end) <= Number(start)) return null;
  return { start: Number(start) * scale, end: Number(end) * scale };
}

function parseModal(params, dongleId) {
  const name = params.get('modal');
  const device = params.get('device');
  if (!MODALS.includes(name) || (device && !DONGLE_ID.test(device))) return null;
  return { name, dongleId: device || dongleId };
}

export function parse({ pathname, search }) {
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;
  const dongleId = DONGLE_ID.test(first) ? first : null;
  const at = (page, fields = {}) => ({
    page, dongleId, logId: null, zoom: null, modal: parseModal(new URLSearchParams(search), dongleId), ...fields,
  });

  if (parts.length === 0 || (parts.length === 1 && first === 'demo')) return at('root');
  if (first === 'auth') return at('auth');
  if (parts.length === 1 && first === 'referrals') return at('referrals');
  if (dongleId && parts.length === 1) return at('dashboard');
  if (dongleId && parts.length === 2 && (second === 'prime' || second === 'stream')) return at(second);
  if (dongleId && LOG_ID.test(second) && (parts.length === 2 || parts.length === 4)) {
    return at('drive', { logId: second, zoom: range(third, fourth, 1000) });
  }
  const legacy = dongleId && parts.length === 3 && range(second, third, 1);
  if (legacy) return at('legacy', { zoom: legacy });
  return at('unknown', { dongleId: null, modal: null });
}

function pathFor({ page, dongleId, logId, zoom }) {
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  switch (page) {
    case 'dashboard': return `/${dongleId}`;
    case 'prime':
    case 'stream': return `/${dongleId}/${page}`;
    case 'drive': return zoom
      ? `/${dongleId}/${logId}/${Math.floor(zoom.start / 1000)}/${Math.ceil(zoom.end / 1000)}`
      : `/${dongleId}/${logId}`;
    case 'legacy': return `/${dongleId}/${zoom.start}/${zoom.end}`;
    default: return '/';
  }
}

export function urlFor(destination) {
  const path = pathFor(destination);
  const { modal, dongleId } = destination;
  if (!modal) return path;
  const query = stringifyQuery({ modal: modal.name, device: modal.dongleId !== dongleId ? modal.dongleId : null });
  return `${path}?${query}`;
}
