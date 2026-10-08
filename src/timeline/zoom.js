const sameRange = (a, b) => a.start === b.start && a.end === b.end;

const contains = (outer, inner) => outer.start <= inner.start && inner.end <= outer.end;

export function isWholeRoute(range, route) {
  return range.start === 0 && range.end === route?.duration;
}

export function zoomStack(zoom) {
  const stack = [];

  for (let z = zoom; z; z = z.previous) {
    stack.unshift({ start: z.start, end: z.end });
  }

  return stack;
}

export function zoomFrom(stack) {
  let zoom = null;

  for (const { start, end } of stack) {
    zoom = { start, end, previous: zoom };
  }

  return zoom;
}

export function nextTimeline(state, logId, start, end) {
  const sameRoute = logId === state.selectedRouteId;

  if (!logId) {
    return sameRoute ? null : { selectedRouteId: null, currentRoute: null, zoom: null, clearsFiles: false, clearsLoop: true };
  }

  const currentRoute = state.routes?.find((route) => route.log_id === logId) || null;
  const whole = currentRoute ? { start: 0, end: currentRoute.duration } : null;
  const range = start === null ? whole : { start, end: whole ? Math.min(end, whole.end) : end };
  const current = zoomStack(state.zoom);
  let stack = sameRoute ? [...current] : [whole].filter(Boolean);
  const outside = stack.findIndex((zoom) => !range || !contains(zoom, range));
  stack = outside === -1 ? stack : stack.slice(0, outside);

  if (range && !(stack.length && sameRange(stack[stack.length - 1], range))) {
    stack.push(range);
  }

  const unchanged = sameRoute && stack.length === current.length && stack.every((zoom, i) => sameRange(zoom, current[i]));

  if (unchanged) {
    return null;
  }

  return {
    selectedRouteId: logId,
    currentRoute,
    zoom: zoomFrom(stack),
    clearsFiles: !state.zoom || !range || !contains(state.zoom, range),
    clearsLoop: start === null,
  };
}
