import { matchPath } from 'react-router-dom';

export const PAGES = {
  PRIME: 'prime',
  STREAM: 'stream',
  REFERRALS: 'referrals',
};

export const DIALOGS = {
  SETTINGS: 'settings',
};

const DONGLE_ID = ':dongleId([a-f0-9]{16})';
const LOG_ID = ':logId([a-f0-9-]{20})';
const DEVICE_PAGE = `:page(${PAGES.PRIME}|${PAGES.STREAM})`;

// Every page the app understands; dialogs open over any page with ?dialog=.
// Drive zooms are in seconds, legacy ranges in milliseconds.
const ROUTES = [
  `/:page(${PAGES.REFERRALS})`,
  `/${DONGLE_ID}`,
  `/${DONGLE_ID}/${DEVICE_PAGE}`,
  `/${DONGLE_ID}/${LOG_ID}`,
  `/${DONGLE_ID}/${LOG_ID}/:start(\\d+)/:end(\\d+)`,
  `/${DONGLE_ID}/:legacyStart(\\d+)/:legacyEnd(\\d+)`,
];

function range(start, end, scale) {
  return start === undefined ? null : { start: Number(start) * scale, end: Number(end) * scale };
}

export function parseUrl(pathname, search = '') {
  const match = ROUTES.map((path) => matchPath(pathname, { path, exact: true, sensitive: true })).find(Boolean);
  const params = match?.params ?? matchPath(pathname, { path: `/${DONGLE_ID}`, sensitive: true })?.params ?? {};
  const dialog = new URLSearchParams(search).get('dialog');

  return {
    dongleId: params.dongleId ?? null,
    page: params.page ?? null,
    logId: params.logId ?? null,
    zoom: range(params.start, params.end, 1000),
    legacyRange: range(params.legacyStart, params.legacyEnd, 1),
    dialog: Object.values(DIALOGS).includes(dialog) ? dialog : null,
  };
}

export function urlFor({ dongleId = null, page = null, logId = null, zoom = null }) {
  if (page === PAGES.REFERRALS) {
    return '/referrals';
  }

  const parts = dongleId ? [dongleId] : [];
  if (page) {
    parts.push(page);
  } else if (logId) {
    parts.push(logId);
    if (zoom) {
      parts.push(Math.floor(zoom.start / 1000), Math.floor(zoom.end / 1000));
    }
  }
  return `/${parts.join('/')}`;
}

export function dialogUrl(pathname, dialog) {
  return dialog ? `${pathname}?dialog=${dialog}` : pathname;
}

// URL of a drive selection; a zoom spanning the whole drive is left out.
export function driveUrl({ dongleId, routes }, logId, zoom) {
  const route = routes?.find((candidate) => candidate.log_id === logId);
  const wholeDrive = zoom?.start == null || zoom?.end == null || (zoom.start === 0 && zoom.end === route?.duration);
  return urlFor({ dongleId, logId, zoom: wholeDrive ? null : zoom });
}

let lastLocation = null;
let lastUrl = null;

// Parsed URL of the router location, recomputed only when the location changes.
export function selectUrl(state) {
  const { location } = state.router;
  if (location !== lastLocation) {
    lastLocation = location;
    lastUrl = parseUrl(location.pathname, location.search);
  }
  return lastUrl;
}
