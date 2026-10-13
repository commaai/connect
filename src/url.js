const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;

function range(start, end, scale) {
  if (!numberRegex.test(start) || !numberRegex.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

// /                              remembered device
// /demo                          remembered device, on the demo backend
// /referrals
// /:dongleId                     dashboard
// /:dongleId/prime
// /:dongleId/stream
// /:dongleId/:logId              drive
// /:dongleId/:logId/:start/:end  drive range, in seconds
// /:dongleId/:startMs/:endMs     legacy, replaced with its drive
// ?settings=:dongleId            device settings, over any page
// ?uploads=:dongleId             upload queue, over any page
const OVERLAYS = ['settings', 'uploads'];

function pageFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'demo')) return { page: 'root' };
  if (parts.length === 1 && parts[0] === 'referrals') return { page: 'referrals' };

  const [dongleId, second] = parts;
  if (!dongleIdRegex.test(dongleId)) return { page: 'root' };
  if (parts.length === 2 && (second === 'prime' || second === 'stream')) return { page: second, dongleId };
  if (logIdRegex.test(second)) {
    const zoom = parts.length === 4 ? range(parts[2], parts[3], 1000) : null;
    return { page: 'drive', dongleId, logId: second, ...zoom };
  }
  const legacy = parts.length === 3 ? range(parts[1], parts[2], 1) : null;
  return legacy ? { page: 'legacy', dongleId, ...legacy } : { page: 'dashboard', dongleId };
}

export function destinationFromUrl(pathname, search = '') {
  const query = new URLSearchParams(search);
  const overlays = OVERLAYS.map((name) => [name, dongleIdRegex.test(query.get(name)) ? query.get(name) : null]);
  return { ...pageFromPath(pathname), ...Object.fromEntries(overlays) };
}

export function pathForDestination({ page, dongleId, logId, start, end }) {
  if (page === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  if (page === 'drive' && start != null && end != null) {
    return `/${dongleId}/${logId}/${Math.floor(start / 1000)}/${Math.floor(end / 1000)}`;
  }
  if (page === 'drive') return `/${dongleId}/${logId}`;
  return page === 'prime' || page === 'stream' ? `/${dongleId}/${page}` : `/${dongleId}`;
}

export function urlForDestination(destination) {
  const query = new URLSearchParams(OVERLAYS.filter((name) => destination[name]).map((name) => [name, destination[name]]));
  const search = query.toString();
  return pathForDestination(destination) + (search ? `?${search}` : '');
}

// drives can be shared by link, so they open without signing in
export function isPublic({ page }) {
  return page === 'drive' || page === 'legacy';
}
