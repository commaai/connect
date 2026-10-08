import { generatePath, matchPath } from 'react-router-dom';

const dongleIdRegex = /^[0-9a-f]{16}$/;

const DONGLE = ':dongleId([0-9a-f]{16})';
// counter log ids like 0000010a--a51155e496, or timestamp log ids like 2026-08-06--12-00-00
const LOG = ':logId([0-9a-f]{8}--[0-9a-f]{10}|\\d{4}-\\d{2}-\\d{2}--\\d{2}-\\d{2}-\\d{2})';
const SECONDS = '(\\d+)';

// Parsing takes the first row that matches. urlFor builds the first row of a page, so aliases go last.
const ROUTES = [
  { page: 'home', path: '/' },
  { page: 'referrals', path: '/referrals' },
  { page: 'dashboard', path: `/${DONGLE}` },
  { page: 'prime', path: `/${DONGLE}/prime` },
  { page: 'stream', path: `/${DONGLE}/stream` },
  { page: 'drive', path: `/${DONGLE}/${LOG}/:start${SECONDS}?/:end${SECONDS}?` },
  { page: 'home', path: '/demo' },
  // links from before drives had URLs, in ms since the epoch
  { page: 'dashboard', path: `/${DONGLE}/:legacyStart(\\d+)/:legacyEnd(\\d+)` },
];

const MODALS = ['settings', 'pair', 'uploads', 'filter'];

function matchRoute(pathname) {
  for (const { page, path } of ROUTES) {
    const match = matchPath(pathname, { path, exact: true, sensitive: true });
    if (match) {
      return { page, ...match.params };
    }
  }
  return { page: 'home' };
}

function parseRange(start, end) {
  if (end === undefined) {
    return null;
  }
  const range = { start: Number(start) * 1000, end: Number(end) * 1000 };
  return range.start < range.end ? range : null;
}

// A path on this site, read the way the browser will read it, so /\host, //host and /a/..//host are refused.
function parseReturnTo(returnTo) {
  if (!returnTo) {
    return null;
  }
  let url;
  try {
    url = new URL(returnTo, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || url.pathname.startsWith('//')) {
    return null;
  }
  return url.pathname + url.search + url.hash;
}

export function parseLocation({ pathname, search }) {
  const { page, dongleId = null, logId = null, start, end, legacyStart, legacyEnd } = matchRoute(pathname);
  const query = new URLSearchParams(search);
  const modal = MODALS.includes(query.get('modal')) ? query.get('modal') : null;
  const modalDongleId = dongleIdRegex.test(query.get('device')) ? query.get('device') : dongleId;
  return {
    page,
    dongleId,
    logId,
    range: parseRange(start, end),
    legacyRange: legacyStart ? { start: Number(legacyStart), end: Number(legacyEnd) } : null,
    modal,
    modalDongleId: modal && modalDongleId,
    returnTo: page === 'home' ? parseReturnTo(query.get('r')) : null,
  };
}

export function urlFor({ page, dongleId, logId, range, modal, modalDongleId, returnTo }) {
  const { path } = ROUTES.find((route) => route.page === page);
  const pathname = generatePath(path, {
    dongleId,
    logId,
    start: range ? String(range.start / 1000) : undefined,
    end: range ? String(range.end / 1000) : undefined,
  });

  const query = new URLSearchParams();
  if (returnTo) {
    query.set('r', returnTo);
  }
  if (modal) {
    query.set('modal', modal);
    if (modalDongleId && modalDongleId !== dongleId) {
      query.set('device', modalDongleId);
    }
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
