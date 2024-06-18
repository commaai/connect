const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

export function getDongleID(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (!dongleIdRegex.test(parts[0])) {
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

export function getSegmentRange(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 2 && logIdRegex.test(parts[1])) {
    return {
      log_id: parts[1],
      start: Number(parts[2]) * 1000,
      end: Number(parts[3]) * 1000,
    };
  }
  return null;
}

export function getPrimeNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'prime') {
    return true;
  }
  return false;
}