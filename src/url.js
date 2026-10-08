// Every URL connect understands, and the one place it is parsed:
//
//   /referrals
//   /:dongleId                      device dashboard
//   /:dongleId/prime                (also stream)
//   /:dongleId/:logId               whole drive
//   /:dongleId/:logId/:start/:end   part of a drive, in seconds from its start
//   /:dongleId/:start/:end          legacy link to a time range, in milliseconds
//   ?settings                       settings of the selected device, over any page
//
// Anything else names no page; a valid dongle id still selects that device.
const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const PAGES = ['prime', 'stream'];

function parseRange(start, end, scale) {
  if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) {
    return null;
  }
  const range = { start: Number(start) * scale, end: Number(end) * scale };
  // a safe end bounds the start too; digits too long for a number are not safe
  return Number.isSafeInteger(range.end) && range.start < range.end ? range : null;
}

export function parseUrl(pathname, search = '') {
  const parts = pathname.split('/').filter(Boolean);
  const settings = new URLSearchParams(search).has('settings');
  const url = { dongleId: null, page: null, logId: null, zoom: null, legacyZoom: null, settings };

  if (parts.length === 1 && parts[0] === 'referrals') {
    return { ...url, page: 'referrals' };
  }
  if (!DONGLE_ID.test(parts[0])) {
    return url;
  }

  url.dongleId = parts[0];
  if (parts.length === 2 && PAGES.includes(parts[1])) {
    url.page = parts[1];
  } else if (LOG_ID.test(parts[1])) {
    url.logId = parts[1];
    url.zoom = parseRange(parts[2], parts[3], 1000);
  } else if (parts.length === 3) {
    url.legacyZoom = parseRange(parts[1], parts[2], 1);
  }
  return url;
}
