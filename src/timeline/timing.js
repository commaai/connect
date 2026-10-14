export function routeMsFromVideoSeconds(seconds, start = 0) {
  return (Number.isFinite(seconds) ? seconds * 1000 : 0) + (start ?? 0);
}

export function videoSecondsFromRouteMs(offset, start = 0) {
  return Number.isFinite(offset) ? Math.max(0, (offset - (start ?? 0)) / 1000) : 0;
}

// Retain the selection; only playable bounds intersect the actual media coverage.
export function getEffectivePlayBounds(state, duration = Number.POSITIVE_INFINITY) {
  const route = state.currentRoute;
  if (!route) return null;
  const start = Math.max(0, state.zoom?.start ?? 0, state.loop?.startTime ?? 0, route.videoStartOffset ?? 0);
  const end = Math.min(route.duration, state.zoom?.end ?? route.duration,
    state.loop ? state.loop.startTime + state.loop.duration : Number.POSITIVE_INFINITY,
    Number.isFinite(duration) ? routeMsFromVideoSeconds(duration, route.videoStartOffset) : Number.POSITIVE_INFINITY);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function clampRouteOffsetToBounds(offset, bounds) {
  return bounds ? Math.max(bounds.start, Math.min(bounds.end, offset)) : offset;
}

export function normalizeRange(start, end, duration) {
  if (!Number.isFinite(start) || start < 0 || (Number.isFinite(duration) && start >= duration)
    || !Number.isFinite(end) || end <= start) return null;
  if (start === 0 && end === duration) return { start, end };
  return { start: Math.floor(start / 1000) * 1000,
    end: Math.min(Math.ceil(end / 1000) * 1000, duration ?? Number.POSITIVE_INFINITY) };
}
