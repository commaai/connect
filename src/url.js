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

export function destinationFromUrl({ pathname }) {
  const parts = pathname.split('/').filter(Boolean);
  const [root, target] = parts;
  const destination = (page, dongleId = null, logId = null, range = null) => ({ page, dongleId, logId, range });

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
export function urlForDestination({ page, dongleId, logId, range }) {
  let path;
  if (page === 'referrals') path = ['referrals'];
  if (page === 'dashboard') path = [dongleId];
  if (DEVICE_PAGES.includes(page)) path = [dongleId, page];
  if (page === 'drive') path = [dongleId, logId];
  if (page === 'drive' && range) path.push(Math.floor(range.start / 1000), Math.ceil(range.end / 1000));
  return path && path.every((part) => part != null) ? `/${path.join('/')}` : '/';
}
