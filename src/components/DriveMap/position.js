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
