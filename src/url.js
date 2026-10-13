// URL grammar. parse() and toUrl() are inverses; /demo is a parse-only alias.
//
//   path                          view       fields
//   /                             dashboard
//   /demo                         dashboard  (alias, never produced by toUrl)
//   /referrals                    referrals
//   /:dongle                      dashboard  dongleId
//   /:dongle/prime | /stream      prime | stream
//   /:dongle/:log                 drive      whole drive
//   /:dongle/:log/:s/:e           drive      start/end (URL seconds, s < e; Destination ms)
//   /:dongle/:startMs/:endMs      legacy     start/end (raw ms, start < end)
//   anything else                 null
//
//   ?settings=:dongle   settings overlay (ignored unless a valid dongle id)
//   ?uploads | ?add-device | ?filter | ?unpair | ?switch-plan | ?cancel-plan
//                       dialog: one bare key from DIALOGS (the first present wins)
//   anything else       kept verbatim as `rest` (e.g. ?stripe_success=1), written last
//
// Destination: { view, dongleId, log, start, end, settings, dialog, rest }
const DIALOGS = ['uploads', 'add-device', 'filter', 'unpair', 'switch-plan', 'cancel-plan'];
const DONGLE = /^[a-f0-9]{16}$/;
const LOG = /^[a-f0-9-]{20}$/;
const INT = /^\d+$/;

const isRange = (s, e) => INT.test(s) && INT.test(e) && Number(s) < Number(e);

function parsePath(pathname) {
  const segs = pathname.split('/').filter(Boolean);
  const [first, a, b, c] = segs;
  if (segs.length === 0 || (segs.length === 1 && first === 'demo')) return { view: 'dashboard' };
  if (segs.length === 1 && first === 'referrals') return { view: 'referrals' };
  if (!DONGLE.test(first)) return null;
  if (segs.length === 1) return { view: 'dashboard', dongleId: first };
  if (segs.length === 2 && (a === 'prime' || a === 'stream')) return { view: a, dongleId: first };
  if (segs.length === 2 && LOG.test(a)) return { view: 'drive', dongleId: first, log: a };
  if (segs.length === 3 && isRange(a, b)) return { view: 'legacy', dongleId: first, start: Number(a), end: Number(b) };
  if (segs.length === 4 && LOG.test(a) && isRange(b, c)) {
    return { view: 'drive', dongleId: first, log: a, start: b * 1000, end: c * 1000 };
  }
  return null;
}

export function parse({ pathname, search = '' }) {
  const path = parsePath(pathname);
  if (!path) return null;
  const params = new URLSearchParams(search);
  const settings = params.get('settings');
  const dialog = DIALOGS.find((name) => params.has(name)) ?? null;
  ['settings', ...DIALOGS].forEach((key) => params.delete(key));
  return {
    dongleId: null, log: null, start: null, end: null,
    ...path,
    settings: DONGLE.test(settings) ? settings : null,
    dialog,
    rest: params.toString(),
  };
}

function toPath({ view, dongleId, log, start, end }) {
  if (view === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  if (view === 'prime' || view === 'stream') return `/${dongleId}/${view}`;
  if (view === 'legacy') return `/${dongleId}/${start}/${end}`;
  if (view !== 'drive') return `/${dongleId}`;
  const zoom = start != null && end != null ? `/${Math.floor(start / 1000)}/${Math.ceil(end / 1000)}` : '';
  return `/${dongleId}/${log}${zoom}`;
}

export function toUrl(dest) {
  const query = [dest.settings && `settings=${dest.settings}`, dest.dialog, dest.rest]
    .filter(Boolean).join('&');
  return toPath(dest) + (query ? `?${query}` : '');
}

// The current view, read straight from the URL (null for an unknown URL).
export const viewOf = (state) => parse(state.router.location)?.view ?? null;

