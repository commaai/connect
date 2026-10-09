// The URLs of a device's pages. parsePath and pathFor are inverses; ranges
// are milliseconds here and seconds in the URL.
//
//   /:dongleId                              { dongleId }
//   /:dongleId/prime, /:dongleId/stream     { dongleId, page }
//   /:dongleId/:routeId[/:start/:end]       { dongleId, routeId, zoom }
//   /:dongleId/:startMillis/:endMillis      { dongleId, legacyZoom }, old links resolved to a route
//
// Modals open over any page with a query param, read with queryParam:
//   ?settings=:dongleId
//   ?filter

const DONGLE_ID = /^[a-f0-9]{16}$/;
const ROUTE_ID = /^[a-f0-9-]{20}$/;
const DIGITS = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream'];

const NOWHERE = { dongleId: null, routeId: null, zoom: null, page: null, legacyZoom: null };

function toRange(start, end, millisPerUnit) {
  if (!DIGITS.test(start) || !DIGITS.test(end)) {
    return null;
  }
  return { start: Number(start) * millisPerUnit, end: Number(end) * millisPerUnit };
}

export function parsePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second] = parts;
  if (!DONGLE_ID.test(dongleId)) {
    return NOWHERE;
  }
  if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
    return { ...NOWHERE, dongleId, page: second };
  }
  if (ROUTE_ID.test(second)) {
    return { ...NOWHERE, dongleId, routeId: second, zoom: toRange(parts[2], parts[3], 1000) };
  }
  if (parts.length === 3) {
    return { ...NOWHERE, dongleId, legacyZoom: toRange(parts[1], parts[2], 1) };
  }
  return { ...NOWHERE, dongleId };
}

export function pathFor({ dongleId, routeId, zoom, page }) {
  const parts = [dongleId];
  if (page) {
    parts.push(page);
  } else if (routeId) {
    parts.push(routeId);
    if (zoom) {
      // round outward so the URL range always contains the selection
      parts.push(Math.floor(zoom.start / 1000), Math.ceil(zoom.end / 1000));
    }
  }
  return `/${parts.join('/')}`;
}

export function queryParam(location, name) {
  return new URLSearchParams(location.search).get(name);
}
