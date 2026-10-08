const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^[a-f0-9-]{20}$/;
const secondsRegex = /^\d+$/;

const rangeFromParts = (start, end, scale) => {
  const startMillis = Number(start) * scale;
  const endMillis = Number(end) * scale;
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

// Route tree:
// /
// ├── demo
// ├── referrals
// └── :dongleId
//     ├── (dashboard)
//     ├── settings
//     ├── prime
//     ├── stream
//     ├── :logId
//     │   └── :startSeconds/:endSeconds
//     └── :startMillis/:endMillis  (legacy, resolves to a canonical drive URL)
export function destinationFromUrl(pathname) {
  const parts = (pathname || '').split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  if (parts.length === 0) return { kind: 'root' };
  if (parts.length === 1 && dongleId === 'demo') return { kind: 'demo' };
  if (parts.length === 1 && dongleId === 'referrals') return { kind: 'referrals' };
  if (!exactDongleIdRegex.test(dongleId)) return { kind: 'not-found' };
  if (parts.length === 1) return { kind: 'dashboard', dongleId };
  if (parts.length === 2 && ['settings', 'prime', 'stream'].includes(branch)) return { kind: branch, dongleId };
  if (parts.length === 2 && exactLogIdRegex.test(branch)) {
    return { kind: 'drive', dongleId, drive: { logId: branch, start: null, end: null } };
  }
  if (parts.length === 4 && exactLogIdRegex.test(branch)
      && secondsRegex.test(start) && secondsRegex.test(end)) {
    const range = rangeFromParts(start, end, 1000);
    return { kind: 'drive', dongleId, drive: { logId: branch, start: range?.start ?? null, end: range?.end ?? null } };
  }
  if (parts.length === 3 && secondsRegex.test(branch) && secondsRegex.test(start)) {
    const range = rangeFromParts(branch, start, 1);
    if (range) return { kind: 'legacy', dongleId, ...range };
  }
  return { kind: 'not-found' };
}

export function urlForDestination(destination) {
  if (destination?.page === 'referrals') return '/referrals';
  if (!destination?.dongleId) return '/';
  const path = [destination.dongleId];
  if (destination.page === 'prime' || destination.page === 'stream' || destination.page === 'settings') {
    path.push(destination.page);
  }
  if (destination.drive?.logId) {
    path.push(destination.drive.logId);
    if (destination.drive.start != null && destination.drive.end != null) {
      // Floor start and ceil end so the emitted range always contains the
      // requested one and never collapses onto an empty whole-second range.
      path.push(Math.floor(destination.drive.start / 1000), Math.ceil(destination.drive.end / 1000));
    }
  }
  return `/${path.join('/')}`;
}
