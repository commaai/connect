// Every URL connect understands. Any other URL opens the remembered device, like `/`.
//
//   /                               the remembered device
//   /referrals                      referrals
//   /:dongleId                      device dashboard
//   /:dongleId/prime                comma prime
//   /:dongleId/stream               livestream
//   /:dongleId/:logId               drive
//   /:dongleId/:logId/:start/:end   drive range, in seconds from the drive start
//   /:dongleId/:start/:end          old drive link, in milliseconds since the epoch
//   ?settings=:dongleId             device settings, over any page above

const DONGLE_ID = /^[a-f0-9]{16}$/;
const LOG_ID = /^[a-f0-9-]{20}$/;
const INTEGER = /^\d+$/;
const DEVICE_PAGES = ['prime', 'stream'];

function parseRange(start, end, toMillis) {
  if (!INTEGER.test(start) || !INTEGER.test(end) || Number(end) <= Number(start)) {
    return null;
  }
  return { start: Number(start) * toMillis, end: Number(end) * toMillis };
}

export function parseUrl(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [dongleId, second, start, end] = parts;

  if (parts.length === 1 && dongleId === 'referrals') {
    return { page: 'referrals' };
  }
  if (!DONGLE_ID.test(dongleId)) {
    return {};
  }
  if (parts.length === 1) {
    return { dongleId };
  }
  if (parts.length === 2 && DEVICE_PAGES.includes(second)) {
    return { dongleId, page: second };
  }
  if ((parts.length === 2 || parts.length === 4) && LOG_ID.test(second)) {
    return { dongleId, logId: second, zoom: parseRange(start, end, 1000) };
  }
  const legacyRange = parts.length === 3 && parseRange(second, start, 1);
  return legacyRange ? { dongleId, legacyRange } : {};
}

// URL of a drive, or of a range of it in milliseconds. The URL holds whole
// seconds, so the range rounds down and is at least a second long.
export function driveUrl(route, start = 0, end = route.duration) {
  const url = `/${route.dongle_id}/${route.log_id}`;
  const startSeconds = Math.floor(start / 1000);
  const endSeconds = Math.max(Math.floor(end / 1000), startSeconds + 1);
  if (startSeconds === 0 && endSeconds >= Math.floor(route.duration / 1000)) {
    return url;
  }
  return `${url}/${startSeconds}/${endSeconds}`;
}
