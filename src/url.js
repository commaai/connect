const dongleIdRegex = /^[a-f0-9]{16}$/i;
const logIdRegex = /^[a-f0-9-]{20}$/i;
const numberRegex = /^\d+$/;

function getPathParts(pathname) {
  if (typeof pathname !== 'string' && typeof pathname?.split !== 'function') {
    return [];
  }
  return String(pathname).split('/').filter((m) => Boolean(m && m.length));
}

export function getDongleID(pathname) {
  return parsePath(pathname).dongleId;
}

export function getZoom(pathname) {
  const parts = getPathParts(pathname);
  if (parts.length >= 3 && parts[0] !== 'auth') {
    return {
      start: Number(parts[1]),
      end: Number(parts[2]),
    };
  }
  return null;
}

export function getRouteId(pathname) {
  return parsePath(pathname).routeId;
}

export function getRouteZoom(pathname) {
  return parsePath(pathname).zoom;
}

export function getPrimeNav(pathname) {
  return parsePath(pathname).primeNav;
}

export function getStreamNav(pathname) {
  return parsePath(pathname).streamNav;
}

export function getSettingsNav(pathname) {
  return parsePath(pathname).settingsNav;
}

/**
 * Constructs a canonical URL path for the given state.
 * Accepts either a state/options object or positional parameters:
 *   urlForState(dongleId, log_id, start, end, prime, stream, settings)
 *   urlForState({ dongleId, routeId, zoom, primeNav, streamNav, settingsNav })
 */
export function urlForState(dongleIdOrState, log_id, start, end, prime, stream, settings) {
  let dongleId;
  let routeId = log_id;
  let zoomStart = start != null ? Math.floor(start) : null;
  let zoomEnd = end != null ? Math.floor(end) : null;
  let isPrime = prime;
  let isStream = stream;
  let isSettings = settings;

  if (dongleIdOrState && typeof dongleIdOrState === 'object') {
    dongleId = dongleIdOrState.dongleId;
    routeId = dongleIdOrState.routeId || dongleIdOrState.selectedRouteId || dongleIdOrState.log_id || null;
    if (dongleIdOrState.zoom) {
      zoomStart = dongleIdOrState.zoom.start != null ? Math.floor(dongleIdOrState.zoom.start / 1000) : null;
      zoomEnd = dongleIdOrState.zoom.end != null ? Math.floor(dongleIdOrState.zoom.end / 1000) : null;
    } else {
      zoomStart = dongleIdOrState.start != null ? Math.floor(dongleIdOrState.start) : null;
      zoomEnd = dongleIdOrState.end != null ? Math.floor(dongleIdOrState.end) : null;
    }
    isPrime = Boolean(dongleIdOrState.primeNav ?? dongleIdOrState.prime);
    isStream = Boolean(dongleIdOrState.streamNav ?? dongleIdOrState.stream);
    isSettings = Boolean(dongleIdOrState.settingsNav ?? dongleIdOrState.settings);
  } else {
    dongleId = dongleIdOrState;
  }

  if (!dongleId) {
    return '/';
  }

  const path = [dongleId];

  if (routeId) {
    path.push(routeId);
    if (zoomStart && zoomEnd) {
      path.push(zoomStart);
      path.push(zoomEnd);
    }
  } else if (isPrime) {
    path.push('prime');
  } else if (isStream) {
    path.push('stream');
  } else if (isSettings) {
    path.push('settings');
  }

  return `/${path.join('/')}`;
}

/**
 * Parses pathname and search query into a structured, declarative representation of the destination state.
 */
export function parsePath(pathname = '', search = '') {
  let cleanPath = pathname;
  let cleanSearch = search;
  if (typeof cleanPath === 'string' && cleanPath.includes('?')) {
    const [pathPart, queryPart] = cleanPath.split('?');
    cleanPath = pathPart;
    if (!cleanSearch) {
      cleanSearch = queryPart;
    }
  }

  if (typeof cleanPath === 'string' && cleanPath.includes('#')) {
    cleanPath = cleanPath.split('#')[0];
  }
  if (typeof cleanSearch === 'string' && cleanSearch.includes('#')) {
    cleanSearch = cleanSearch.split('#')[0];
  }

  let redirectRoute = null;
  let pairToken = null;
  if (cleanSearch) {
    const searchString = typeof cleanSearch === 'string' && cleanSearch.startsWith('?')
      ? cleanSearch.slice(1)
      : String(cleanSearch);
    try {
      const searchParams = new URLSearchParams(searchString);
      redirectRoute = searchParams.get('r');
      pairToken = searchParams.get('pair');
    } catch {
      // ignore malformed search
    }
  }

  const parts = getPathParts(cleanPath);
  const isDongle = Boolean(parts[0] && dongleIdRegex.test(parts[0]));
  const dongleId = isDongle ? (parts[0] ? parts[0].toLowerCase() : null) : null;

  if (!dongleId) {
    if (parts[0] === 'referrals') {
      return {
        dongleId: null,
        routeId: null,
        zoom: null,
        legacyZoom: null,
        primeNav: false,
        streamNav: false,
        settingsNav: false,
        view: 'referrals',
        redirectRoute,
        pairToken,
      };
    }
    return {
      dongleId: null,
      routeId: null,
      zoom: null,
      legacyZoom: null,
      primeNav: false,
      streamNav: false,
      settingsNav: false,
      view: parts.length === 0 ? 'root' : 'unknown',
      redirectRoute,
      pairToken,
    };
  }

  const sub = parts[1];
  if (parts.length === 1) {
    return {
      dongleId,
      routeId: null,
      zoom: null,
      legacyZoom: null,
      primeNav: false,
      streamNav: false,
      settingsNav: false,
      view: 'dashboard',
      redirectRoute,
      pairToken,
    };
  }

  if (parts.length === 2) {
    if (sub === 'settings') {
      return {
        dongleId,
        routeId: null,
        zoom: null,
        legacyZoom: null,
        primeNav: false,
        streamNav: false,
        settingsNav: true,
        view: 'settings',
        redirectRoute,
        pairToken,
      };
    }
    if (sub === 'prime') {
      return {
        dongleId,
        routeId: null,
        zoom: null,
        legacyZoom: null,
        primeNav: true,
        streamNav: false,
        settingsNav: false,
        view: 'prime',
        redirectRoute,
        pairToken,
      };
    }
    if (sub === 'stream') {
      return {
        dongleId,
        routeId: null,
        zoom: null,
        legacyZoom: null,
        primeNav: false,
        streamNav: true,
        settingsNav: false,
        view: 'stream',
        redirectRoute,
        pairToken,
      };
    }
  }

  if (logIdRegex.test(sub)) {
    const hasZoom = parts.length >= 4 && numberRegex.test(parts[2]) && numberRegex.test(parts[3]) && Number(parts[2]) <= Number(parts[3]);
    return {
      dongleId,
      routeId: sub,
      zoom: hasZoom ? { start: Number(parts[2]) * 1000, end: Number(parts[3]) * 1000 } : null,
      legacyZoom: null,
      primeNav: false,
      streamNav: false,
      settingsNav: false,
      view: 'drive',
      redirectRoute,
      pairToken,
    };
  }

  if (parts.length >= 3 && parts[0] !== 'auth' && !logIdRegex.test(sub) && numberRegex.test(parts[1]) && numberRegex.test(parts[2])) {
    return {
      dongleId,
      routeId: null,
      zoom: null,
      legacyZoom: { start: Number(parts[1]), end: Number(parts[2]) },
      primeNav: false,
      streamNav: false,
      settingsNav: false,
      view: 'legacy',
      redirectRoute,
      pairToken,
    };
  }

  return {
    dongleId,
    routeId: null,
    zoom: null,
    legacyZoom: null,
    primeNav: false,
    streamNav: false,
    settingsNav: false,
    view: 'dashboard',
    redirectRoute,
    pairToken,
  };
}
