const dongleIdRegex = new RegExp('[a-f0-9]{16}');

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

  if (parts.length >= 3 && parts[0] !== 'auth' && parts[1] !== 'clips') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getPrimeNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length == 2 && parts[0] !== 'auth' && parts[1] === 'prime') {
    return true;
  }
  return false;
}

export function getClipsNav(pathname) {
  let parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 2 && parts[0] !== 'auth' && parts[1] === 'clips') {
    if (parts.length === 3 && parts[2]) {
      return {
        clip_id: parts[2],
      };
    } else {
      return {};
    }
  }
  return null;
}
