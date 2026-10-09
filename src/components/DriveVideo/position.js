// The playlist uses video seconds; maps and logs use milliseconds from route start.
export function mediaBounds(route, loop, duration) {
  const origin = route?.videoStartOffset || 0;
  const start = Math.max(0, ((loop?.startTime ?? 0) - origin) / 1000);
  const routeEnd = loop ? loop.startTime + loop.duration : route?.duration;
  const end = Math.min(Number.isFinite(duration) ? duration : Infinity, (routeEnd - origin) / 1000);
  return { start, end };
}

export function seekTarget(seekable, time, bounds, fragments) {
  const target = Math.max(bounds.start, Math.min(bounds.end, time));
  // MSE's seekable range includes EXT-X-GAP segments. The playlist can identify
  // those holes without excluding valid segments that have not downloaded yet.
  const known = Array.isArray(fragments) ? fragments.filter(fragment => fragment
    && Number.isFinite(fragment.start) && Number.isFinite(fragment.end)
    && fragment.end > fragment.start).sort((a, b) => a.start - b.start) : [];
  if (known.length) {
    const playlistEnd = known.reduce((end, fragment) => Math.max(end, fragment.end), 0);
    const available = known.filter(fragment => !fragment.gap);
    const ranges = available
      .map(fragment => ({ start: Math.max(bounds.start, fragment.start), end: Math.min(bounds.end, fragment.end) }))
      .filter(range => range.end > range.start)
      .sort((a, b) => a.start - b.start);
    if (!ranges.length) return null;
    const playableAt = position => available.some(fragment =>
      position >= fragment.start && position < fragment.end) || position === playlistEnd;
    for (const range of ranges) {
      if (target < range.start) return range.start;
      if (target < range.end || (target === range.end && playableAt(target))) return target;
    }
    const last = ranges[ranges.length - 1];
    // A hole starts at its boundary; the preceding frame is still playable.
    return playableAt(last.end) ? last.end : Math.max(last.start, last.end - 0.001);
  }
  if (!seekable?.length) return target;
  let previous = bounds.start;
  for (let i = 0; i < seekable.length; i++) {
    const start = Math.max(bounds.start, seekable.start(i));
    const end = Math.min(bounds.end, seekable.end(i));
    if (end < start) continue;
    if (target >= start && target <= end) return target;
    if (target < start) return start;
    previous = end;
  }
  return previous;
}
