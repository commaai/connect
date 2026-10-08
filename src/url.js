const exactDongleIdRegex = /^[a-f0-9]{16}$/;
const exactLogIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;

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
  if (typeof pathname !== 'string') return { kind: 'not-found' };
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  if (parts.length === 0) return { kind: 'root' };
  if (parts.length === 1 && first === 'referrals') return { kind: 'referrals' };
  if (!exactDongleIdRegex.test(first)) return { kind: 'not-found' };

  const dongleId = first;
  if (parts.length === 1) return { kind: 'dashboard', dongleId };
  if (parts.length === 2 && second === 'settings') return { kind: 'settings', dongleId };
  if (parts.length === 2 && second === 'prime') return { kind: 'prime', dongleId };
  if (parts.length === 2 && second === 'stream') return { kind: 'stream', dongleId };
  if (parts.length === 2 && exactLogIdRegex.test(second)) {
    return { kind: 'drive', dongleId, logId: second, start: null, end: null };
  }
  if (parts.length === 4 && exactLogIdRegex.test(second) && numberRegex.test(third) && numberRegex.test(fourth)) {
    const range = driveRange(third, fourth);
    return { kind: 'drive', dongleId, logId: second, start: range?.start ?? null, end: range?.end ?? null };
  }
  if (parts.length === 3 && numberRegex.test(second) && numberRegex.test(third)) {
    const range = legacyRange(second, third);
    if (range) return { kind: 'legacy', dongleId, ...range };
  }
  return { kind: 'not-found' };
}

export function urlForDestination(destination) {
  if (!destination) return '/';
  if (destination.kind === 'referrals' || destination.page === 'referrals') return '/referrals';
  if (!destination.dongleId) return '/';

  const path = [destination.dongleId];
  const page = destination.page || destination.kind;

  if (page === 'settings' || page === 'prime' || page === 'stream') {
    path.push(page);
  } else if (page === 'drive') {
    const logId = destination.drive?.logId || destination.logId;
    if (logId) {
      path.push(logId);
      const start = destination.drive?.start ?? destination.start;
      const end = destination.drive?.end ?? destination.end;
      if (start != null && end != null) {
        path.push(Math.floor(start / 1000), Math.floor(end / 1000));
      }
    }
  }
  return `/${path.join('/')}`;
}

export function getDongleID(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (!exactDongleIdRegex.test(parts[0])) {
    return null;
  }

  return parts[0] || null;
}

export function getZoom(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);
  if (parts.length >= 3 && parts[0] !== 'auth') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getRouteId(pathname) {
  const dest = destinationFromUrl(pathname);
  return dest.kind === 'drive' ? dest.logId : null;
}

export function getRouteZoom(pathname) {
  const dest = destinationFromUrl(pathname);
  if (dest.kind === 'drive' && dest.start != null && dest.end != null) {
    return { start: dest.start, end: dest.end };
  }
  return null;
}

export function getPrimeNav(pathname) {
  return destinationFromUrl(pathname).kind === 'prime';
}

export function getStreamNav(pathname) {
  return destinationFromUrl(pathname).kind === 'stream';
}
