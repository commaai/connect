const dongleIdPattern = /^[a-f0-9]{16}$/;
const logIdPattern = /^[a-f0-9-]{20}$/;
const numberPattern = /^\d+$/;
const devicePages = ['prime', 'stream', 'settings'];

function parseRange(start, end, unit) {
  if (!numberPattern.test(start) || !numberPattern.test(end)) return null;
  const range = { start: Number(start) * unit, end: Number(end) * unit };
  return Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.end > range.start
    ? range : null;
}

// URL grammar lives here. All ranges in application state are milliseconds;
// drive URLs use seconds, while legacy URLs use absolute millisecond timestamps.
export function destinationFromUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;
  if (!parts.length || pathname === '/demo') return { kind: 'root' };
  if (parts.length === 1 && dongleId === 'referrals') return { kind: 'referrals' };
  if (!dongleIdPattern.test(dongleId)) return { kind: 'not-found' };
  if (parts.length === 1) return { kind: 'dashboard', dongleId };
  if (parts.length === 2 && devicePages.includes(branch)) return { kind: branch, dongleId };
  if (logIdPattern.test(branch)) {
    if (parts.length === 2) return { kind: 'drive', dongleId, logId: branch, start: null, end: null };
    if (parts.length === 4) {
      if (!numberPattern.test(start) || !numberPattern.test(end)) return { kind: 'not-found' };
      const range = parseRange(start, end, 1000);
      return { kind: 'drive', dongleId, logId: branch, start: range?.start ?? null, end: range?.end ?? null };
    }
  }
  if (parts.length === 3) {
    const range = parseRange(branch, start, 1);
    if (range) return { kind: 'legacy', dongleId, ...range };
  }
  return { kind: 'not-found' };
}

export function urlForDestination(destination) {
  const { kind, dongleId, logId, start, end } = destination;
  if (kind === 'referrals') return '/referrals';
  if (!dongleId) return '/';
  const path = [dongleId];
  if (devicePages.includes(kind)) path.push(kind);
  if (kind === 'drive') {
    path.push(logId);
    if (start != null && end != null) path.push(Math.floor(start / 1000), Math.floor(end / 1000));
  }
  return `/${path.join('/')}`;
}
