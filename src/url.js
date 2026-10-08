// Every page in connect and the path that shows it. This table is the only
// place that knows what a URL looks like: parseUrl reads paths with it and
// buildUrl writes them, so the two always agree.
//
// A location is a plain object: { page, ...params }, e.g.
//   { page: 'drive', dongleId: '1d3dc3e03047b0c7', logId: '000000dd--455f14369d', start: 10000, end: 20000 }

const text = (pattern) => ({ pattern, parse: (s) => s, format: (v) => v });

// drive ranges are seconds in the URL and milliseconds everywhere else
const seconds = { pattern: /^\d+$/, parse: (s) => Number(s) * 1000, format: (ms) => Math.floor(ms / 1000) };
const milliseconds = { pattern: /^\d+$/, parse: Number, format: (ms) => ms };

const PARAMS = {
  dongleId: text(/^[a-f0-9]{16}$/),
  logId: text(/^[a-f0-9-]{20}$/),
  start: seconds,
  end: seconds,
  from: milliseconds,
  to: milliseconds,
};

// When building, the first route of a page with all of its params set wins.
const ROUTES = [
  ['home', '/'],
  ['referrals', '/referrals'],
  ['dashboard', '/:dongleId'],
  ['prime', '/:dongleId/prime'],
  ['stream', '/:dongleId/stream'],
  ['settings', '/:dongleId/settings'],
  ['drive', '/:dongleId/:logId/:start/:end'],
  ['drive', '/:dongleId/:logId'],
  ['legacy', '/:dongleId/:from/:to'], // old links to a time window rather than a drive
].map(([page, path]) => {
  const segments = path.split('/').filter(Boolean);
  const params = segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1));
  return { page, segments, params };
});

function matchRoute(route, parts) {
  if (route.segments.length !== parts.length) {
    return null;
  }
  const location = { page: route.page };
  const matches = route.segments.every((segment, i) => {
    if (!segment.startsWith(':')) {
      return segment === parts[i];
    }
    const name = segment.slice(1);
    if (!PARAMS[name].pattern.test(parts[i])) {
      return false;
    }
    location[name] = PARAMS[name].parse(parts[i]);
    return true;
  });
  return matches ? location : null;
}

function findRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of ROUTES) {
    const location = matchRoute(route, parts);
    if (location) {
      return { route, location };
    }
  }
  return null;
}

// The location a path shows, or null for paths that aren't pages (/demo, /auth/...).
export function parseUrl(pathname) {
  return findRoute(pathname)?.location ?? null;
}

// The path that shows a location. Locations without a route go home.
export function buildUrl(location) {
  const route = ROUTES.find(({ page, params }) => page === location.page
    && params.every((name) => location[name] != null));
  if (!route) {
    return '/';
  }
  const parts = route.segments.map((segment) => (segment.startsWith(':')
    ? PARAMS[segment.slice(1)].format(location[segment.slice(1)])
    : segment));
  return `/${parts.join('/')}`;
}

// The path with each param replaced by its name, e.g. /<dongleId>/prime, for analytics.
export function anonymizeUrl(pathname) {
  const found = findRoute(pathname);
  if (!found) {
    return pathname.replace(/(.)\/$/, '$1');
  }
  const parts = found.route.segments.map((segment) => segment.replace(/^:(.*)$/, '<$1>'));
  return `/${parts.join('/')}`;
}

// The page on screen right now.
export function currentPage(state) {
  return parseUrl(state.router.location.pathname)?.page ?? null;
}
