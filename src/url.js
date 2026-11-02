const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;

function parseRange(start, end, scale) {
  const range = { start: Number(start) * scale, end: Number(end) * scale };
  return Number.isFinite(range.start) && Number.isFinite(range.end) ? range : null;
}

/**
 * Parse a pathname into the state it describes
 *
 * /:dongleId
 * /:dongleId/prime
 * /:dongleId/stream
 * /:dongleId/:logId[/:start/:end]  start/end in seconds into the route
 * /:dongleId/:start/:end           legacy link, start/end in unix ms
 *
 * @param {string} pathname
 * @returns {{dongleId: ?string, selectedRouteId: ?string, zoom: ?object, legacyZoom: ?object, primeNav: boolean, streamNav: boolean}}
 */
export function parseUrl(pathname) {
  const [dongleId, ...rest] = pathname.split('/').filter(Boolean);
  const state = {
    dongleId: null,
    selectedRouteId: null,
    zoom: null,
    legacyZoom: null,
    primeNav: false,
    streamNav: false,
  };
  if (!DONGLE_ID.test(dongleId)) {
    return state;
  }
  state.dongleId = dongleId;

  if (LOG_ID.test(rest[0])) {
    state.selectedRouteId = rest[0];
    state.zoom = rest.length >= 3 ? parseRange(rest[1], rest[2], 1000) : null;
  } else if (rest.length === 1) {
    state.primeNav = rest[0] === 'prime';
    state.streamNav = rest[0] === 'stream';
  } else if (rest.length >= 2) {
    state.legacyZoom = parseRange(rest[0], rest[1], 1);
  }
  return state;
}
