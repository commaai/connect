const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

export function parseLocation(location) {
  const parts = location.pathname.split('/').filter((m) => m.length);

  const dongleId = dongleIdRegex.test(parts[0] ?? '') ? parts[0] : null;

  const logId = parts.length >= 2 && logIdRegex.test(parts[1]) ? parts[1] : null;

  const zoom = logId && parts.length >= 4
    ? { start: Number(parts[2]) * 1000, end: Number(parts[3]) * 1000 }
    : null;

  const legacyZoom = parts.length >= 3 && parts[0] !== 'auth'
    ? { start: Number(parts[1]), end: Number(parts[2]) }
    : null;


  const isPrime = Boolean(parts.length === 2 && dongleId !== null && parts[1] === 'prime');
  const isStream = Boolean(parts.length === 2 && dongleId !== null && parts[1] === 'stream');
  const isReferrals = parts[0] === 'referrals';
  const isAuth = parts[0] === 'auth';

  return { dongleId, logId, zoom, legacyZoom, isPrime, isStream, isReferrals, isAuth };
}

export function urlFor(route) {
  if (route.isReferrals) return '/referrals';
  if (!route.dongleId) return '/';
  const parts = [route.dongleId];
  if (route.logId) {
    parts.push(route.logId);
    if (route.zoom && route.zoom.start && route.zoom.end) {
      parts.push(route.zoom.start);
      parts.push(route.zoom.end);
    }
  } else if (route.isPrime) {
    parts.push('prime');
  } else if (route.isStream) {
    parts.push('stream');
  }
  return `/${parts.join('/')}`;
}
