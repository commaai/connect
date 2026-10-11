const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;
const devicePages = ['prime', 'stream'];

function parseRange(start, end, scale) {
  if (!numberRegex.test(start) || !numberRegex.test(end) || Number(start) >= Number(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

// /                                the selected device's dashboard
// /referrals                       referrals
// /:dongleId                       dashboard
// /:dongleId/prime|stream          device page
// /:dongleId/:logId                drive
// /:dongleId/:logId/:start/:end    drive zoomed to a range, in seconds
// /:dongleId/:start/:end           legacy timestamp range, in milliseconds
// ?settings=:dongleId              device settings over any page, see settingsUrl
function parsePath(pathname) {
  const [dongleId, ...parts] = pathname.split('/').filter(Boolean);
  if (!dongleIdRegex.test(dongleId)) {
    return pathname === '/referrals' ? { page: 'referrals' } : {};
  }

  if (logIdRegex.test(parts[0])) {
    return { dongleId, routeId: parts[0], zoom: parseRange(parts[1], parts[2], 1000) };
  }
  const legacyZoom = parseRange(parts[0], parts[1], 1);
  if (legacyZoom) {
    return { dongleId, legacyZoom };
  }
  if (parts.length === 1 && devicePages.includes(parts[0])) {
    return { dongleId, page: parts[0] };
  }
  // anything else under a device is its dashboard
  return parts.length ? { dongleId, redirect: `/${dongleId}` } : { dongleId };
}

export function parseUrl({ pathname, search = '' }) {
  const url = parsePath(pathname);
  const settingsDongleId = new URLSearchParams(search).get('settings');
  return settingsDongleId ? { ...url, settingsDongleId } : url;
}

export function driveUrl(route, start, end) {
  const path = `/${route.dongle_id}/${route.log_id}`;
  // within a second of the whole drive is the whole drive
  if (start == null || end == null || (start < 1000 && end > route.duration - 1000)) {
    return path;
  }
  // whole seconds, rounded outwards within the drive so a range never collapses
  const endSeconds = Math.min(Math.ceil(end / 1000), Math.floor(route.duration / 1000));
  const startSeconds = Math.min(Math.floor(start / 1000), endSeconds - 1);
  return `${path}/${startSeconds}/${endSeconds}`;
}

export function settingsUrl({ pathname, search }, dongleId) {
  const query = new URLSearchParams(search);
  if (dongleId) {
    query.set('settings', dongleId);
  } else {
    query.delete('settings');
  }
  return query.toString() ? `${pathname}?${query}` : pathname;
}
