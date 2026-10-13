export function routeMsFromVideoSeconds(seconds, start = 0) {
  return (Number.isFinite(seconds) ? seconds * 1000 : 0) + (start ?? 0);
}

export function videoSecondsFromRouteMs(offset, start = 0) {
  return Number.isFinite(offset) ? Math.max(0, (offset - (start ?? 0)) / 1000) : 0;
}

function effectiveStartBound(state, route) {
  return Math.max(
    0,
    state.zoom?.start ?? 0,
    state.loop?.startTime ?? 0,
    route.videoStartOffset ?? 0,
  );
}

function loopEndBound(loop) {
  if (!loop) {
    return Number.POSITIVE_INFINITY;
  }
  return loop.startTime + loop.duration;
}

function mediaEndBound(duration, videoStartOffset) {
  if (!Number.isFinite(duration)) {
    return Number.POSITIVE_INFINITY;
  }
  return routeMsFromVideoSeconds(duration, videoStartOffset);
}

function effectiveEndBound(state, route, duration) {
  return Math.min(
    route.duration,
    state.zoom?.end ?? route.duration,
    loopEndBound(state.loop),
    mediaEndBound(duration, route.videoStartOffset),
  );
}

function validPlayBounds(start, end) {
  if (!Number.isFinite(start)) {
    return null;
  }
  if (!Number.isFinite(end)) {
    return null;
  }
  if (end <= start) {
    return null;
  }
  return { start, end };
}

// User selection is retained; only playable bounds intersect the media coverage.
export function getEffectivePlayBounds(state, duration = Number.POSITIVE_INFINITY) {
  const route = state.currentRoute;
  if (!route) {
    return null;
  }
  const start = effectiveStartBound(state, route);
  const end = effectiveEndBound(state, route, duration);
  return validPlayBounds(start, end);
}

export function clampRouteOffsetToBounds(offset, bounds) {
  return bounds ? Math.max(bounds.start, Math.min(bounds.end, offset)) : offset;
}

function isInvalidRangeStart(start, duration) {
  if (!Number.isFinite(start)) {
    return true;
  }
  if (start < 0) {
    return true;
  }
  if (Number.isFinite(duration) && start >= duration) {
    return true;
  }
  return false;
}

export function normalizeRange(start, end, duration) {
  if (isInvalidRangeStart(start, duration)) {
    return null;
  }
  if (!Number.isFinite(end)) {
    return null;
  }
  if (end <= start) {
    return null;
  }
  if (start === 0 && end === duration) {
    return { start, end };
  }
  return {
    start: Math.floor(start / 1000) * 1000,
    end: Math.min(Math.ceil(end / 1000) * 1000, duration ?? Number.POSITIVE_INFINITY),
  };
}
