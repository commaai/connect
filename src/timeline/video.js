// Maps route time (ms since the drive's first segment started) to the time of its
// qcamera video (seconds) and back. The API titles each playlist entry with its
// segment number, `#EXTINF:59.999955,3`, so a segment left out of the playlist
// shows up as a jump in the numbers.
const SEGMENT_LENGTH = 60 * 1000;

export function parsePlaylist(text) {
  const segments = [];
  let start = 0;
  for (const [, duration, number] of text.matchAll(/^#EXTINF:([\d.]+),(\d*)/gm)) {
    segments.push({ number: number ? Number(number) : segments.length, start, duration: Number(duration) });
    start += Number(duration);
  }
  return segments;
}

function routeStart(segment, videoStartOffset) {
  return (segment.number * SEGMENT_LENGTH) + videoStartOffset;
}

// Route offsets without video map to the next segment that has some, or to the end of the video.
export function toVideoTime(segments, videoStartOffset, offset) {
  const segment = segments.find((s) => offset < routeStart(s, videoStartOffset) + (s.duration * 1000));
  if (!segment) {
    const last = segments[segments.length - 1];
    return last.start + last.duration;
  }
  return segment.start + (Math.max(0, offset - routeStart(segment, videoStartOffset)) / 1000);
}

// Whole milliseconds, because browsers cut video time to microseconds. The cut can leave a
// seek to the start of a segment just before it, so a segment starts one microsecond early.
export function toRouteOffset(segments, videoStartOffset, time) {
  const segment = segments.filter((s) => s.start <= time + 1e-6).pop() || segments[0];
  return Math.round(routeStart(segment, videoStartOffset) + ((time - segment.start) * 1000));
}

export function missingSegments(segments, segmentNumbers) {
  return segmentNumbers.filter((number) => !segments.some((s) => s.number === number));
}
