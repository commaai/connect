// Route tree:
// /
// ├── demo
// ├── referrals
// └── :dongleId
//     ├── prime
//     ├── stream
//     ├── :logId
//     │   └── :start/:end (seconds)
//     └── :startMs/:endMs (legacy, replaced by its drive)
// dialogs: ?settings=:dongleId ?uploads=:dongleId ?add-device

const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream'];

function rangeOf(start, end, scale) {
  const range = { start: Number(start) * scale, end: Number(end) * scale };
  return numberRegex.test(start) && numberRegex.test(end) && Number.isSafeInteger(range.end) && range.start < range.end
    ? range
    : null;
}

export function destinationFromUrl({ pathname, search = '' }) {
  const parts = pathname.split('/').filter(Boolean);
  const [root, target] = parts;
  const query = new URLSearchParams(search);
  const deviceIn = (key) => (exactDongleIdRegex.test(query.get(key)) ? query.get(key) : null);
  const destination = (page, dongleId = null, logId = null, range = null) => ({
    page, dongleId, logId, range,
    settings: deviceIn('settings'), uploads: deviceIn('uploads'), addDevice: query.has('add-device'),
  });

  if (parts.length > 4) return destination('not-found');
  if (!root || (root === 'demo' && !target)) return destination('root');
  if (root === 'referrals' && !target) return destination('referrals');
  if (!exactDongleIdRegex.test(root)) return destination('not-found');
  if (!target) return destination('dashboard', root);
  if (parts.length === 2 && DEVICE_PAGES.includes(target)) return destination(target, root);
  if (exactLogIdRegex.test(target)) {
    const [, , start, end] = parts;
    if (parts.length === 2 || (parts.length === 3 && numberRegex.test(start))) return destination('drive', root, target); // or a copied segment name
    const range = rangeOf(start, end, 1000);
    return range ? destination('drive', root, target, range) : destination('not-found');
  }
  const [, startMs, endMs, extra] = parts;
  const legacy = !extra && rangeOf(startMs, endMs, 1);
  return legacy ? destination('legacy', root, null, legacy) : destination('not-found');
}

// ranges round outwards, so a selection keeps its edges
export function urlForDestination({ page, dongleId, logId, range, settings, uploads, addDevice }) {
  let path;
  if (page === 'referrals') path = ['referrals'];
  if (page === 'dashboard') path = [dongleId];
  if (DEVICE_PAGES.includes(page)) path = [dongleId, page];
  if (page === 'drive') path = [dongleId, logId];
  if (page === 'drive' && range) path.push(Math.floor(range.start / 1000), Math.ceil(range.end / 1000));
  const pathname = path && path.every((part) => part != null) ? `/${path.join('/')}` : '/';
  const dialogs = [settings && `settings=${settings}`, uploads && `uploads=${uploads}`, addDevice && 'add-device'];
  const query = dialogs.filter(Boolean).join('&');
  return query ? `${pathname}?${query}` : pathname;
}

export function urlWithDialog({ pathname, search }, dialog, value) {
  const param = dialog === 'addDevice' ? 'add-device' : dialog;
  const query = new URLSearchParams(search);
  query.delete(param);
  if (value) {
    query.append(param, value === true ? '' : value);
  }
  const rest = query.toString().replace(/(^|&)add-device=(?=&|$)/, '$1add-device');
  return rest ? `${pathname}?${rest}` : pathname;
}

export function keepingQuery(url, search) {
  const kept = new URLSearchParams(search);
  ['settings', 'uploads', 'add-device', 'pair'].forEach((key) => kept.delete(key)); // pair: used up on load
  const rest = kept.toString();
  return rest ? `${url}${url.includes('?') ? '&' : '?'}${rest}` : url;
}

// what a signed-out visitor may open
export const isPublic = (nav) => (nav.page === 'drive' || nav.page === 'legacy')
  && !nav.settings && !nav.uploads && !nav.addDevice;

export function localPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    return null;
  }
  const { origin } = window.location;
  try {
    const resolved = new URL(url, origin);
    return resolved.origin === origin ? resolved.pathname + resolved.search + resolved.hash : null;
  } catch {
    return null;
  }
}

export const pathOf = ({ pathname, search = '', hash = '' }) => pathname + search + hash;

export const returnPathIn = (search) => localPath(new URLSearchParams(search).get('r'));

export const signInUrl = (path) => (localPath(path) ? `/?${new URLSearchParams({ r: path })}` : '/');
