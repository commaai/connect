// qcamera.m3u8 titles each segment with its route segment number and leaves out missing ones

const SEGMENT_LENGTH = 60 * 1000;

export function parsePlaylist(text) {
  const segments = [];
  let start = 0;
  for (const line of text.split('\n')) {
    const match = line.match(/^#EXTINF:([\d.]+),\s*(\d+)?/);
    if (match) {
      const duration = Number(match[1]);
      const number = match[2] !== undefined ? Number(match[2]) : segments.length;
      segments.push({ number, start, duration });
      start += duration;
    }
  }
  return segments;
}

export function videoTimeToOffset(segments, videoStartOffset, time) {
  let segment = null;
  for (const s of segments) {
    if (s.start > time) {
      break;
    }
    segment = s;
  }
  if (!segment) {
    return videoStartOffset + (time * 1000);
  }
  return videoStartOffset + (segment.number * SEGMENT_LENGTH) + ((time - segment.start) * 1000);
}

export function offsetToVideoTime(segments, videoStartOffset, offset) {
  const routeTime = Math.max(0, offset - videoStartOffset);
  if (!segments.length) {
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
  return segment.start + Math.min(segment.duration, (routeTime - (number * SEGMENT_LENGTH)) / 1000);
}
