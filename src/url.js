// every url connect understands. to add a page, add a line
export const PAGES = {
  home: '/',
  referrals: '/referrals',
  dashboard: '/:dongleId',
  settings: '/:dongleId/settings',
  prime: '/:dongleId/prime',
  stream: '/:dongleId/stream',
  drive: '/:dongleId/:routeId',
  zoom: '/:dongleId/:routeId/:start/:end', // seconds into the drive
  legacy: '/:dongleId/:start/:end', // unix ms, from before drives had ids
};

const NUMBER = /^\d{1,13}$/;
const PARAMS = {
  dongleId: /^[a-f0-9]{16}$/,
  routeId: /^[a-f0-9-]{20}$/,
  start: NUMBER,
  end: NUMBER,
};

const split = (path) => path.split('/').filter(Boolean);

// '/0123456789abcdef/prime' -> { page: 'prime', dongleId: '0123456789abcdef' }
export function parseUrl(pathname) {
  const parts = split(pathname);
  for (const [page, pattern] of Object.entries(PAGES)) {
    const names = split(pattern);
    const params = {};
    const matches = names.length === parts.length && names.every((name, i) => {
      if (!name.startsWith(':')) {
        return name === parts[i];
      }
      const param = name.slice(1);
      params[param] = PARAMS[param] === NUMBER ? Number(parts[i]) : parts[i];
      return PARAMS[param].test(parts[i]);
    });
    if (matches) {
      return { page, ...params };
    }
  }
  // not a url we know, its longest prefix that we do know is the closest page
  return parseUrl(parts.slice(0, -1).join('/'));
}

// 'prime', { dongleId: '0123456789abcdef' } -> '/0123456789abcdef/prime'
export function urlFor(page, params) {
  return PAGES[page].replace(/:(\w+)/g, (_, param) => params[param]);
}

// the url of the page a path is read as. the path can come from anywhere, the result is always ours
export function canonicalUrl(pathname) {
  const { page, ...params } = parseUrl(pathname);
  return urlFor(page, params);
}

// drives can be public, every other page needs an account
export const isPublic = (pathname) => ['drive', 'zoom', 'legacy'].includes(parseUrl(pathname).page);

export const currentPage = (state) => parseUrl(state.router.location.pathname).page;
