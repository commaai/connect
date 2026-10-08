// The qcamera playlist titles every entry with its segment number, e.g.
// `#EXTINF:59.999955,3`. Segments that were never uploaded are left out, so the
// video skips them while the route keeps their place. These map between video
// time and route time (seconds since the first video frame) across those gaps.

const SEGMENT_LENGTH = 60;

/**
 * @param {string} playlist m3u8 text
 * @returns {{ segment: number, start: number, duration: number }[] | null}
 *   null when the entries aren't numbered, so time maps 1:1
 */
export function parseQcameraPlaylist(playlist) {
  const segments = [];
  let start = 0;
  for (const line of playlist.split('\n')) {
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/^#EXTINF:([\d.]+),\s*(\d+)\s*$/);
      if (!match) {
        return null;
      }
      const duration = Number(match[1]);
      segments.push({ segment: Number(match[2]), start, duration });
      start += duration;
    }
  }
  return segments.length ? segments : null;
}

/**
 * @param {ReturnType<typeof parseQcameraPlaylist>} segments
 * @param {number} time video time in seconds
 * @returns {number} route time in seconds
 */
export function videoToRouteTime(segments, time) {
  if (!segments) {
    return time;
  }
  const entry = segments.findLast((s) => s.start <= time) || segments[0];
  return (entry.segment * SEGMENT_LENGTH) + (time - entry.start);
}

/**
 * A route time inside a segment that was never uploaded maps to the start of
 * the next uploaded one.
 *
 * @param {ReturnType<typeof parseQcameraPlaylist>} segments
 * @param {number} routeTime route time in seconds
 * @returns {number} video time in seconds
 */
export function routeToVideoTime(segments, routeTime) {
  if (!segments) {
    return routeTime;
  }
  const segment = Math.floor(routeTime / SEGMENT_LENGTH);
  const entry = segments.find((s) => s.segment >= segment);
  if (!entry) {
    const last = segments[segments.length - 1];
    return last.start + last.duration;
  }
  if (entry.segment > segment) {
    return entry.start;
  }
  return entry.start + Math.min(routeTime - (segment * SEGMENT_LENGTH), entry.duration);
}
