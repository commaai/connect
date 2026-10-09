// Helpers for finding the car's position on the map at a playback offset.
//
// driveCoords maps a time in seconds since the start of the route to a
// [lng, lat] pair. GPS fixes are roughly once per second, but there can be
// gaps (tunnels, lost fix, missing segments), so lookups must not assume a
// fix exists at every second.

/**
 * Build a sorted index of drive coordinates for fast lookups.
 *
 * @param {Object<string, number[]>} driveCoords
 * @returns {{ times: number[], coords: number[][] } | null}
 */
export function buildCoordIndex(driveCoords) {
  if (!driveCoords) {
    return null;
  }

  const entries = Object.entries(driveCoords)
    .map(([t, coord]) => [Number(t), coord])
    .filter(([t, coord]) => Number.isFinite(t) && Array.isArray(coord))
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return null;
  }

  return {
    times: entries.map(([t]) => t),
    coords: entries.map(([, coord]) => coord),
  };
}

/**
 * Position at an offset, interpolating between the nearest known fixes.
 * Offsets before the first fix or after the last fix clamp to that fix.
 *
 * @param {{ times: number[], coords: number[][] } | null} index
 * @param {number} offsetMs offset from the start of the route, in milliseconds
 * @returns {number[] | null} [lng, lat]
 */
export function positionAtOffset(index, offsetMs) {
  if (!index || offsetMs === null || offsetMs === undefined || Number.isNaN(offsetMs)) {
    return null;
  }

  const { times, coords } = index;
  const t = offsetMs / 1000;
  const last = times.length - 1;

  if (t <= times[0]) {
    return coords[0];
  }
  if (t >= times[last]) {
    return coords[last];
  }

  // binary search for the last fix at or before t
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const [lng0, lat0] = coords[lo];
  const [lng1, lat1] = coords[hi];
  const fraction = (t - times[lo]) / (times[hi] - times[lo]);
  return [
    lng0 + ((lng1 - lng0) * fraction),
    lat0 + ((lat1 - lat0) * fraction),
  ];
}

const DEGREES = 180 / Math.PI;
const METRES_PER_DEGREE = 111000;
// movement over the heading window below which gps jitter would make the heading spin
const MIN_HEADING_DISTANCE = 3;

/**
 * Direction of travel at an offset, in degrees clockwise from north.
 *
 * @param {{ times: number[], coords: number[][] } | null} index
 * @param {number} offsetMs
 * @param {number} [windowMs] how far either side of the offset to look
 * @returns {number | null} null when there is no data, or the car is not moving enough to tell
 */
export function headingAtOffset(index, offsetMs, windowMs = 1000) {
  const from = positionAtOffset(index, offsetMs - windowMs);
  const to = positionAtOffset(index, offsetMs + windowMs);
  if (!from || !to) {
    return null;
  }
  const dLat = to[1] - from[1];
  const dLng = (to[0] - from[0]) * Math.cos(((from[1] + to[1]) / 2) / DEGREES);
  if (Math.hypot(dLat, dLng) * METRES_PER_DEGREE < MIN_HEADING_DISTANCE) {
    return null;
  }
  return ((Math.atan2(dLng, dLat) * DEGREES) + 360) % 360;
}

/**
 * Shortest rotation from one bearing to another, in degrees within (-180, 180].
 *
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function shortestTurn(from, to) {
  const turn = (to - from) % 360;
  if (turn > 180) {
    return turn - 360;
  }
  if (turn <= -180) {
    return turn + 360;
  }
  return turn;
}
