const dongleIdRegex = /[a-f0-9]{16}/;
const logIdRegex = /[a-f0-9-]{20}/;

export function centralUrlParse(pathname) {
  //uniform return object
  const route = {
    page: 'unknown',
    dongleId: null,
    routeId: null,
    start: null,
    end: null
  };
  const staticPages = new Set(['referrals', 'auth', 'demo']);

  //split pathname into parts
  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  //home page
  if (parts.length === 0) {
    route.page = 'home';
  }

  //checking Non-device related pages
  if (staticPages.has(first)) {
    route.page = first;
  }

  //checking Device related pages
  if (dongleIdRegex.test(first ?? '')) {
    route.dongleId = parts[0] || null;

    if (logIdRegex.test(second ?? '')) {
      route.page = 'drive';
      route.routeId = second;
      if (parts.length >= 4) {
        route.start = Number(third) * 1000;
        route.end = Number(fourth) * 1000;
      }
    }

    if (parts.length === 2 && ['prime', 'stream'].includes(second)) {
      route.page = second;
    }
  }

  return route;
}


export function getDongleID(pathname) {
  const loc = centralUrlParse(pathname);
  return loc.dongleId;
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
  const loc = centralUrlParse(pathname);
  return loc.routeId;
}

export function getRouteZoom(pathname) {
  const { routeId, start, end } = centralUrlParse(pathname);

  return routeId && Number.isFinite(start) && Number.isFinite(end)
    ? { start, end }
    : null;
}

export function getPrimeNav(pathname) {
  const loc = centralUrlParse(pathname);
  return (loc.page === 'prime');
}

export function getStreamNav(pathname) {
  const loc = centralUrlParse(pathname);
  return (loc.page === 'stream');
}
