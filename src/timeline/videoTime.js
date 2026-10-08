// Playlist media seconds and backend route milliseconds are separate domains.
export function parseQcameraPlaylist(text) {
  if (typeof text !== 'string' || !text.trimStart().startsWith('#EXTM3U')) return null;
  const entries = [];
  let pending = null;
  let start = 0;
  for (const line of text.split(/\r?\n/).map((value) => value.trim())) {
    if (line.startsWith('#EXTINF:')) {
      if (pending) return null;
      const match = line.match(/^#EXTINF:(\d+(?:\.\d+)?),(\d+)$/);
      if (!match) return null;
      const duration = Number(match[1]);
      const number = Number(match[2]);
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isSafeInteger(number)
        || (entries.length && number <= entries[entries.length - 1].number)) return null;
      pending = { number, start, duration };
    } else if (line && !line.startsWith('#')) {
      if (!pending) return null;
      entries.push(pending);
      start += pending.duration;
      if (!Number.isFinite(start)) return null;
      pending = null;
    }
  }
  return !pending && entries.length ? entries : null;
}

export function createVideoMapping(route, entries) {
  const numbers = route?.segment_numbers;
  const starts = route?.segment_start_times;
  const ends = route?.segment_end_times;
  if (!Array.isArray(entries) || !entries.length || !Array.isArray(numbers) || !numbers.length
    || starts?.length !== numbers.length || ends?.length !== numbers.length) return null;
  const origin = starts[0];
  const firstFrame = route.videoStartOffset ?? 0;
  if (!Number.isFinite(origin) || !Number.isFinite(firstFrame) || firstFrame < 0) return null;
  const segments = new Map();
  for (let i = 0; i < numbers.length; i++) {
    if (!Number.isSafeInteger(numbers[i]) || numbers[i] < 0 || segments.has(numbers[i])
      || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || ends[i] <= starts[i]
      || (i && (numbers[i] <= numbers[i - 1] || starts[i] < ends[i - 1]))) return null;
    segments.set(numbers[i], { start: starts[i] - origin, end: ends[i] - origin });
  }
  const mapping = [];
  let mediaEnd = 0;
  let previousNumber = -1;
  for (const entry of entries) {
    const segment = segments.get(entry.number);
    if (!segment || !Number.isFinite(entry.start) || entry.start !== mediaEnd
      || !Number.isFinite(entry.duration) || entry.duration <= 0 || entry.number <= previousNumber) return null;
    // firstFrame is already route-relative, never add it to segment-number time.
    const routeStart = Math.max(segment.start, firstFrame);
    const routeEnd = Math.min(segment.end, routeStart + entry.duration * 1000);
    mediaEnd = entry.start + entry.duration;
    if (!Number.isFinite(mediaEnd) || routeEnd <= routeStart) return null;
    mapping.push({ mediaStart: entry.start, mediaEnd, routeStart, routeEnd });
    previousNumber = entry.number;
  }
  return mapping;
}

export function mediaToRoute(mapping, seconds) {
  if (!mapping?.length || !Number.isFinite(seconds)) return null;
  const entry = mapping.find((part) => seconds < part.mediaEnd) || mapping[mapping.length - 1];
  return Math.min(entry.routeEnd, entry.routeStart + Math.max(0, seconds - entry.mediaStart) * 1000);
}

export function routeToMedia(mapping, milliseconds) {
  if (!mapping?.length || !Number.isFinite(milliseconds)) return null;
  const entry = mapping.find((part) => milliseconds < part.routeEnd);
  if (!entry) return mapping[mapping.length - 1].mediaEnd;
  return Math.min(entry.mediaEnd, entry.mediaStart + Math.max(0, milliseconds - entry.routeStart) / 1000);
}

export function routeSegmentAt(route, offset) {
  if (!Number.isFinite(offset) || offset < 0 || !route?.segment_numbers?.length) return null;
  const origin = route.segment_start_times?.[0];
  if (!Number.isFinite(origin)) return null;
  for (let i = 0; i < route.segment_numbers.length; i++) {
    const start = route.segment_start_times[i] - origin;
    const end = route.segment_end_times?.[i] - origin;
    if (offset >= start && offset < end) return { number: route.segment_numbers[i], start, end };
  }
  return null;
}
