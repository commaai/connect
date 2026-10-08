const dongleIdRegex = /^[a-f0-9]{16}$/;
const logIdRegex = /^[a-f0-9-]{20}$/;
const numberRegex = /^\d+$/;

function parseRange(start, end, scale) {
  if (!numberRegex.test(start) || !numberRegex.test(end)) {
    return null;
  }
  return { start: Number(start) * scale, end: Number(end) * scale };
}

// /:dongleId                       dashboard
// /:dongleId/prime|stream          device page
// /:dongleId/:logId                drive
// /:dongleId/:logId/:start/:end    drive zoomed to a range, in seconds
// /:dongleId/:start/:end           legacy timestamp range, in milliseconds
// ?settings=:dongleId              device settings over any page, read in explorer.jsx
export function parseUrl(pathname) {
  const [dongleId, ...parts] = pathname.split('/').filter(Boolean);
  if (!dongleIdRegex.test(dongleId)) {
    return {};
  }

  if (logIdRegex.test(parts[0])) {
    return { dongleId, routeId: parts[0], zoom: parseRange(parts[1], parts[2], 1000) };
  }
  const legacyZoom = parseRange(parts[0], parts[1], 1);
  if (legacyZoom) {
    return { dongleId, legacyZoom };
  }
  if (parts.length === 1 && ['prime', 'stream'].includes(parts[0])) {
    return { dongleId, page: parts[0] };
  }
  return { dongleId };
}

export function driveUrl(route, start, end) {
  const path = `/${route.dongle_id}/${route.log_id}`;
  if (start == null || end == null || (start === 0 && end === route.duration)) {
    return path;
  }
  // whole seconds, rounded outwards within the drive so a range never collapses
  const endSeconds = Math.min(Math.ceil(end / 1000), Math.floor(route.duration / 1000));
  const startSeconds = Math.min(Math.floor(start / 1000), endSeconds - 1);
  return `${path}/${startSeconds}/${endSeconds}`;
}
