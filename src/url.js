// The URL grammar of connect.
//
// Every screen is described by a route:
//
//   { view, dongleId, logId, range, settings }
//
//   view      one of the keys of ROUTES
//   dongleId  device in the path, or null (keep the current selection)
//   logId     drive in the path, or null
//   range     { start, end } in ms, or null. Relative to the drive for 'drive',
//             absolute UTC for 'legacyRange'.
//   settings  device whose settings modal is open (?settings=), or null
//
// parseLocation() and buildPath() are inverses. Nothing else reads or writes paths.

const PARAMS = {
  dongleId: /^[a-f0-9]{16}$/,
  logId: /^[a-f0-9-]{20}$/,
  start: /^\d+$/,
  end: /^\d+$/,
};

// view -> path templates, general to specific. Templates of different views never
// overlap, so a path matches at most one.
const ROUTES = {
  dashboard: ['/', '/:dongleId'],
  referrals: ['/referrals'],
  prime: ['/:dongleId/prime'],
  stream: ['/:dongleId/stream'],
  drive: ['/:dongleId/:logId', '/:dongleId/:logId/:start/:end'],
  legacyRange: ['/:dongleId/:start/:end'], // old links: absolute ms, resolved to a drive on arrival
};

// milliseconds per URL range unit
const RANGE_UNIT = { drive: 1000, legacyRange: 1 };

const segments = (path) => path.split('/').filter(Boolean);

function matchTemplate(template, parts) {
  const names = segments(template);
  if (names.length !== parts.length) {
    return null;
  }

  const params = {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (name.startsWith(':')) {
      const key = name.slice(1);
      if (!PARAMS[key].test(parts[i])) {
        return null;
      }
      params[key] = parts[i];
    } else if (name !== parts[i]) {
      return null;
    }
  }
  return params;
}

function toRoute(view, params) {
  const unit = RANGE_UNIT[view];
  return {
    view,
    dongleId: params.dongleId ?? null,
    logId: params.logId ?? null,
    range: params.start ? { start: Number(params.start) * unit, end: Number(params.end) * unit } : null,
  };
}

function toParams({ view, dongleId, logId, range }) {
  const params = { dongleId, logId };
  if (range) {
    const unit = RANGE_UNIT[view];
    const start = Math.floor(range.start / unit);
    params.start = start;
    params.end = Math.max(Math.floor(range.end / unit), start + 1); // never collapse to an empty range
  }
  return params;
}

function matchPath(parts) {
  for (const [view, templates] of Object.entries(ROUTES)) {
    for (const template of templates) {
      const params = matchTemplate(template, parts);
      if (params) {
        return toRoute(view, params);
      }
    }
  }
  // unknown paths show the dashboard of the device they start with, if any
  return toRoute('dashboard', PARAMS.dongleId.test(parts[0]) ? { dongleId: parts[0] } : {});
}

export function parseLocation({ pathname, search = '' }) {
  const route = matchPath(segments(pathname));
  const settings = new URLSearchParams(search).get('settings');
  return { ...route, settings: settings && PARAMS.dongleId.test(settings) ? settings : null };
}

export function buildPath(route) {
  const params = toParams(route);
  const fill = (name) => (name.startsWith(':') ? params[name.slice(1)] : name);

  // templates are listed general to specific: use the last one the route can fill
  const template = ROUTES[route.view]
    .map(segments)
    .filter((names) => names.map(fill).every((part) => part != null))
    .pop();
  if (!template) {
    throw new Error(`incomplete ${route.view} route: ${JSON.stringify(route)}`);
  }

  const path = `/${template.map(fill).join('/')}`;
  return route.settings ? `${path}?settings=${route.settings}` : path;
}

// The route of the current location. Memoized on the location object, so
// connected components see the same route until the URL actually changes.
let lastLocation = null;
let lastRoute = null;
export function selectRoute(state) {
  const { location } = state.router;
  if (location !== lastLocation) {
    lastLocation = location;
    lastRoute = parseLocation(location);
  }
  return lastRoute;
}
