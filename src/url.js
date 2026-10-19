const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^[a-f0-9-]{20}$/;
const secondsRegex = /^\d+$/;

const driveRange = (start, end) => {
  const startMillis = Number(start) * 1000;
  const endMillis = Number(end) * 1000;
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

const legacyRange = (start, end) => {
  const startMillis = Number(start);
  const endMillis = Number(end);
  if (!Number.isSafeInteger(startMillis) || !Number.isSafeInteger(endMillis) || endMillis <= startMillis) return null;
  return { start: startMillis, end: endMillis };
};

export function destinationFromUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, branch, start, end] = parts;

  if (parts.length === 0 || (parts.length === 1 && dongleId === 'demo')) return { kind: 'root' };
  if (parts.length === 1 && dongleId === 'referrals') return { kind: 'referrals' };
  if (!exactDongleIdRegex.test(dongleId)) return { kind: 'not-found' };
  if (parts.length === 1) return { kind: 'dashboard', dongleId };
  if (parts.length === 2 && branch === 'prime') return { kind: 'prime', dongleId };
  if (parts.length === 2 && branch === 'stream') return { kind: 'stream', dongleId };
  if (parts.length === 2 && branch === 'settings') return { kind: 'settings', dongleId };
  if (parts.length === 2 && exactLogIdRegex.test(branch)) {
    return { kind: 'drive', dongleId, logId: branch, start: null, end: null };
  }
  if (parts.length === 4 && exactLogIdRegex.test(branch)
      && secondsRegex.test(start) && secondsRegex.test(end)) {
    const range = driveRange(start, end);
    return { kind: 'drive', dongleId, logId: branch, start: range?.start ?? null, end: range?.end ?? null };
  }
  if (parts.length === 3 && secondsRegex.test(branch) && secondsRegex.test(start)) {
    const range = legacyRange(branch, start);
    if (range) return { kind: 'legacy', dongleId, ...range };
  }
  return { kind: 'not-found' };
}

export function urlForDestination(destination) {
  if (!destination?.dongleId) return '/';
  const path = [destination.dongleId];
  if (['prime', 'stream', 'settings'].includes(destination.page)) path.push(destination.page);
  if (destination.drive?.logId) {
    path.push(destination.drive.logId);
    if (destination.drive.start != null && destination.drive.end != null) {
      // round outwards, so a selection inside one second doesn't become empty
      path.push(Math.floor(destination.drive.start / 1000), Math.ceil(destination.drive.end / 1000));
    }
  }
  return `/${path.join('/')}`;
}

// these dialogs are query params so they open over any page: ?add-device, ?filter
export const dialogFromUrl = (search, name) => new URLSearchParams(search).get(name);
