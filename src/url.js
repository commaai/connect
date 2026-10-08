// Route tree:
// /                              root: remembered device, or first owned device
// /auth/...                      authentication callback
// /referrals                     referrals
// /:dongleId                     dashboard
// /:dongleId/settings            device settings
// /:dongleId/prime               comma prime
// /:dongleId/stream              live stream
// /:dongleId/:logId              drive
// /:dongleId/:logId/:start/:end  drive zoomed to [start, end], whole seconds
// /:dongleId/:start/:end         legacy time range in ms, replaced with the drive URL
const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const isRangeBound = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

export function destinationFromUrl(pathname) {
  const destination = { kind: 'not-found', dongleId: null, logId: null, start: null, end: null };
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return { ...destination, kind: 'root' };
  if (parts[0] === 'auth') return { ...destination, kind: 'auth' };
  if (parts[0] === 'referrals' && parts.length === 1) return { ...destination, kind: 'referrals' };

  let [dongleId, page, start, end, ...extra] = parts;
  if (!dongleIdRegex.test(dongleId) || extra.length) return destination;
  let kind;
  let logId = null;
  let scale = 1;
  if (page === undefined) kind = 'dashboard';
  else if (['settings', 'prime', 'stream'].includes(page) && start === undefined) kind = page;
  else if (logIdRegex.test(page) && ((start === undefined && end === undefined) || (start !== undefined && end !== undefined))) {
    kind = 'drive';
    logId = page;
    scale = 1000;
  } else if (isRangeBound(page) && isRangeBound(start) && end === undefined) {
    kind = 'legacy';
    end = start;
    start = page;
  } else return destination;

  const validRange = isRangeBound(start) && isRangeBound(end)
    && Number.isFinite(Number(end) * scale) && Number(start) < Number(end);
  if (kind === 'legacy' && !validRange) return destination;
  return { kind, dongleId, logId, start: validRange ? Number(start) * scale : null, end: validRange ? Number(end) * scale : null };
}

export function urlForDestination({ kind, dongleId, logId, start, end }) {
  if (kind === 'auth') return '/auth';
  if (kind === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  const parts = [dongleId];
  if (['settings', 'prime', 'stream'].includes(kind)) parts.push(kind);
  if (kind === 'drive') parts.push(logId);
  if (['drive', 'legacy'].includes(kind) && start != null && end != null) {
    if (kind === 'drive') {
      parts.push(Math.floor(start / 1000), Math.ceil(end / 1000));
    } else {
      parts.push(start, end);
    }
  }
  return `/${parts.join('/')}`;
}
