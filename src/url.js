const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

export function centralUrlParse(pathname) {
  //split pathname into parts
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  //home page
  if (parts.length === 0) { return { page: 'home' }; }

  //checking Non-device related pages
  if (first === 'referrals') { return { page: 'referrals' }; }
  if (first === 'auth') { return { page: 'auth' }; }
  if (first === 'demo') { return { page: 'demo' }; }

  //checking Device related pages
  if (!dongleIdRegex.test(first ?? '')) { return { page: 'unknown' }; }

  if (parts.length >= 4) {
    if (!logIdRegex.test(second ?? '')) { return { page: 'unknown' }; }
    return {
      page: 'drive',
      start: Number(third) * 1000,
      end: Number(fourth) * 1000
    };
  }
  if (parts.length === 2) {
    if (second === 'prime') { return { page: 'prime', id: dongleId }; }
    if (second === 'stream') { return { page: 'stream', id: dongleId }; }
  }
  if (parts.length === 1) { return { page: 'dashboard' }; }

}


export function getDongleID(pathname) {
  centralUrlParse(pathname);
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

export function getRouteId(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 2 && logIdRegex.test(parts[1])) {
    return parts[1];
  }
  return null;
}

export function getRouteZoom(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (getRouteId(pathname) && parts.length >= 4) {
    return {
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

export function getStreamNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length === 2 && dongleIdRegex.test(parts[0]) && parts[1] === 'stream') {
    return true;
  }
  return false;
}
