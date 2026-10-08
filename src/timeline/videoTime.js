// Route time (ms into the route's logs) <-> qcamera video time (s).
//
// The video starts videoStartOffset ms into the route. Segments without video are left
// out of its playlist, so after one the video is a segment behind the route. Each
// playlist entry is titled with its segment number, which lines the two up exactly.
const SEGMENT_LENGTH = 60000;

// [{ number, start, duration }] in video seconds, or null without segment numbers
export function parseQcameraPlaylist(text) {
  const segments = [];
  let start = 0;
  for (const [, duration, title] of text.matchAll(/^#EXTINF:([\d.]+),(.*?)\r?$/gm)) {
    if (!/^\d+$/.test(title)) {
      return null;
    }
    segments.push({ number: Number(title), start, duration: Number(duration) });
    start += Number(duration);
  }
  return segments.length ? segments : null;
}

export function videoToRouteOffset(route, segments, time) {
  const segment = segments?.findLast((s) => s.start <= time) || segments?.[0];
  const segmentOffset = segment ? (segment.number * SEGMENT_LENGTH) - (segment.start * 1000) : 0;
  return (route.videoStartOffset || 0) + segmentOffset + (time * 1000);
}

// a route offset without video maps to the start of the next segment with video
export function routeToVideoTime(route, segments, offset) {
  const routeTime = Math.max(0, offset - (route.videoStartOffset || 0));
  if (!segments) {
    return routeTime / 1000;
  }
  const number = Math.floor(routeTime / SEGMENT_LENGTH);
  const segment = segments.find((s) => s.number >= number);
  if (!segment) {
    const last = segments[segments.length - 1];
    return last.start + last.duration;
  }
  if (segment.number > number) {
    return segment.start;
  }
  return segment.start + Math.min((routeTime / 1000) - (number * 60), segment.duration);
}
