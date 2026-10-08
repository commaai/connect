import { generatePath, matchPath } from 'react-router-dom';

// Every URL in connect. parseUrl reads addresses with this table and urlFor
// writes them, so the two can never disagree.
const dongleId = ':dongleId([a-f0-9]{16})';
const logId = ':logId([a-f0-9-]{20})';

export const PAGES = {
  root: '/',
  referrals: '/referrals',
  device: `/${dongleId}`,
  settings: `/${dongleId}/settings`,
  prime: `/${dongleId}/prime`,
  stream: `/${dongleId}/stream`,
  // A drive, optionally zoomed in to a range in seconds from its start.
  drive: `/${dongleId}/${logId}/:start(\\d+)?/:end(\\d+)?`,
  // Old links: a range of milliseconds since the epoch, redirected to its drive.
  timeRange: `/${dongleId}/:startTime(\\d+)/:endTime(\\d+)`,
};

// Pages drawn over the page they were opened from.
export const MODALS = ['settings'];

// { page, ...params } for a pathname, with page null if no page matches.
// Times are in milliseconds, and a drive's range is its zoom.
export function parseUrl(pathname) {
  for (const [page, path] of Object.entries(PAGES)) {
    const match = matchPath(pathname, { path, exact: true });
    if (match) {
      const { start, end, startTime, endTime, ...params } = match.params;
      return {
        page,
        ...params,
        ...(start && end && { zoom: { start: start * 1000, end: end * 1000 } }),
        ...(startTime && { startTime: Number(startTime), endTime: Number(endTime) }),
      };
    }
  }
  return { page: null };
}

export function urlFor(page, { zoom, ...params } = {}) {
  return generatePath(PAGES[page], {
    ...params,
    ...(zoom && { start: Math.floor(zoom.start / 1000), end: Math.floor(zoom.end / 1000) }),
  });
}

// The page on screen for a location: a modal shows over the page it was
// opened from, or over its device when the modal's URL was entered directly.
export function pageAt(location) {
  return parseUrl(location.state?.background ?? location.pathname);
}
