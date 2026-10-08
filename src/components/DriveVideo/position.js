// The playlist uses video seconds; maps and logs use milliseconds from route start.
export function mediaBounds(route, loop, duration) {
  const origin = route?.videoStartOffset || 0;
  const start = Math.max(0, ((loop?.startTime ?? 0) - origin) / 1000);
  const routeEnd = loop ? loop.startTime + loop.duration : route?.duration;
  const end = Math.min(Number.isFinite(duration) ? duration : Infinity, (routeEnd - origin) / 1000);
  return { start, end };
}

export function seekTarget(seekable, time, bounds) {
  const target = Math.max(bounds.start, Math.min(bounds.end, time));
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
