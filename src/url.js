/**
 * Beautiful URL handling — the single grammar for navigation URLs.
 *
 * Supported shapes (pathname):
 *   /                              dashboard (no device selected)
 *   /referrals                     referrals page
 *   /demo                          dashboard using the demo backend
 *   /<dongleId>                    device dashboard
 *   /<dongleId>/prime              comma prime page
 *   /<dongleId>/stream             body teleop stream
 *   /<dongleId>/<routeId>          drive view (whole drive)
 *   /<dongleId>/<routeId>/<s>/<e>  drive view, zoomed (seconds in URL, ms in state)
 *   /<dongleId>/<start>/<end>      LEGACY drive view (seconds); converted to a route URL
 *
 * Supported query params:
 *   ?settings=<dongleId>  device settings overlay (page underneath is preserved)
 *   ?pair=<token>         pair-device dialog trigger
 *   ?r=<path>             login redirect target (consumed at boot, not nav state)
 *
 * `parseLocation` and `buildUrl` are strict inverses for every canonical URL:
 *   buildUrl(parseLocation(url)) === url
 * Parsing never throws: unparsable input yields a safe fallback nav state.
 */

const DONGLE_ID_RE = /^[a-f0-9]{16}$/;
const ROUTE_ID_RE = /^[a-f0-9-]{20}$/;

function parseZoomSeconds(first, second) {
  const start = Number(first);
  const end = Number(second);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start: start * 1000, end: end * 1000 };
}

export function parseLocation(location) {
  const pathname = location?.pathname ?? '/';
  const query = new URLSearchParams(location?.search ?? '');
  const parts = pathname.split('/').filter(Boolean);

  const nav = {
    page: 'dashboard',
    dongleId: null,
    routeId: null,
    zoom: null, // { start, end } in ms, or null
    legacy: null, // { start, end } in seconds (legacy form), or null
    settings: query.get('settings'),
    pair: query.get('pair'),
  };

  if (parts.length === 0) {
    return nav; // '/'
  }

  const [first, second, third, fourth] = parts;

  if (first === 'referrals' && parts.length === 1) {
    nav.page = 'referrals';
    return nav;
  }

  if (first === 'demo' && parts.length === 1) {
    return nav; // dashboard; the demo backend is selected by pathname elsewhere
  }

  if (!DONGLE_ID_RE.test(first)) {
    nav.page = 'unknown'; // e.g. /auth/* — leave state alone
    return nav;
  }
  nav.dongleId = first;

  if (parts.length === 1) {
    return nav; // /<dongleId>
  }
  if (second === 'prime' && parts.length === 2) {
    nav.page = 'prime';
    return nav;
  }
  if (second === 'stream' && parts.length === 2) {
    nav.page = 'stream';
    return nav;
  }

  if (ROUTE_ID_RE.test(second)) {
    nav.routeId = second;
    nav.page = 'drive';
    if (parts.length === 2) {
      return nav;
    }
    if (parts.length === 4) {
      const zoom = parseZoomSeconds(third, fourth);
      if (zoom) {
        nav.zoom = zoom;
        return nav;
      }
    }
    // Unrecognized range suffix — fall back to the drive without zoom
    // rather than crashing or misreading the URL.
    return nav;
  }

  if (parts.length === 3) {
    const legacy = parseZoomSeconds(second, third);
    if (legacy) {
      nav.legacy = { start: legacy.start / 1000, end: legacy.end / 1000 };
      return nav;
    }
  }

  return nav; // /<dongleId>/* — dashboard for a known device
}

/**
 * Serialize canonical nav state to a URL. Inverse of parseLocation for every
 * canonical URL. `routeDuration` (ms) lets whole-drive zooms serialize without
 * a range, matching historical URLs.
 */
export function buildUrl(nav, opts = {}) {
  const { routeDuration } = opts;
  let path;
  switch (nav.page) {
    case 'referrals':
      path = '/referrals';
      break;
    case 'prime':
      path = `/${nav.dongleId}/prime`;
      break;
    case 'stream':
      path = `/${nav.dongleId}/stream`;
      break;
    case 'drive': {
      path = `/${nav.dongleId}/${nav.routeId}`;
      const zoom = nav.zoom;
      const wholeDrive = !zoom || (zoom.start === 0 && routeDuration != null && zoom.end === routeDuration);
      if (zoom && !wholeDrive) {
        path += `/${Math.floor(zoom.start / 1000)}/${Math.floor(zoom.end / 1000)}`;
      }
      break;
    }
    case 'dashboard':
    default:
      path = nav.dongleId ? `/${nav.dongleId}` : '/';
      break;
  }

  const query = new URLSearchParams();
  if (nav.settings) {
    query.set('settings', nav.settings);
  }
  if (nav.pair) {
    query.set('pair', nav.pair);
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Return the current pathname with query params patched (set or removed).
 * Used for overlay dialogs: open = add param, close = remove param.
 */
export function withQuery(location, patch) {
  const query = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) {
      query.delete(key);
    } else {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return search ? `${location.pathname}?${search}` : location.pathname;
}
