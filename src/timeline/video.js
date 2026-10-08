// Converts between a drive's video time (seconds) and its timeline offset
// (milliseconds since the drive started).
//
// The qcamera playlist lists every uploaded segment with its segment number
// as the title, e.g. `#EXTINF:59.999955,3`. Segments that were never uploaded
// are absent, so the video skips them while the timeline keeps their place.

export const SEGMENT_SECONDS = 60;

// [{ segment, start, duration }] in video seconds, or null if the playlist
// doesn't number its segments
export function parsePlaylist(playlist) {
  const segments = [];
  let start = 0;
  for (const line of playlist.split('\n')) {
    const match = line.match(/^#EXTINF:([\d.]+),\s*(\d+)\s*$/);
    if (line.startsWith('#EXTINF:') && !match) {
      return null;
    }
    if (match) {
      const duration = Number(match[1]);
      segments.push({ segment: Number(match[2]), start, duration });
      start += duration;
    }
  }
  return segments.length ? segments : null;
}

// videoStartOffset is the offset of the first video frame
export function videoTimeToOffset(segments, videoStartOffset, time) {
  let seconds = time;
  if (segments) {
    const seg = segments.findLast((s) => s.start <= time) || segments[0];
    seconds = (seg.segment * SEGMENT_SECONDS) + (time - seg.start);
  }
  return videoStartOffset + (seconds * 1000);
}

// an offset in a missing segment maps to the start of the next uploaded one
export function offsetToVideoTime(segments, videoStartOffset, offset) {
  const seconds = Math.max(0, (offset - videoStartOffset) / 1000);
  if (!segments) {
    return seconds;
  }

  const segment = Math.floor(seconds / SEGMENT_SECONDS);
  const seg = segments.find((s) => s.segment >= segment);
  if (!seg) {
    const last = segments[segments.length - 1];
    return last.start + last.duration;
  }
  if (seg.segment > segment) {
    return seg.start;
  }
  return seg.start + Math.min(seconds - (segment * SEGMENT_SECONDS), seg.duration);
}

// { first, last } segments missing right before the offset, for the first
// seconds after them
export function skippedSegments(segments, videoStartOffset, offset, withinSeconds = 3) {
  if (!segments) {
    return null;
  }
  const seconds = (offset - videoStartOffset) / 1000;
  const index = segments.findLastIndex((s) => s.segment * SEGMENT_SECONDS <= seconds);
  const seg = segments[index];
  if (!seg || seconds - (seg.segment * SEGMENT_SECONDS) > withinSeconds) {
    return null;
  }
  const first = index > 0 ? segments[index - 1].segment + 1 : 0;
  return first < seg.segment ? { first, last: seg.segment - 1 } : null;
}
