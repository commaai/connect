/**
 * Whether to show the preserved-routes cue for the current list context.
 * @param {object} params
 * @param {Array|null|undefined} params.routes - Loaded routes; nullish means unloaded.
 * @param {object|null|undefined} params.device
 * @param {string} params.dongleId
 * @param {object|null|undefined} params.routesMeta - Must match dongleId when present.
 * @param {number} params.limit
 * @param {object|null|undefined} params.segmentRange
 */
export function shouldShowPreservedRoutesCue({
  routes,
  device,
  dongleId,
  routesMeta,
  limit,
  segmentRange,
}) {
  if (routes == null || routes.length === 0) return false;
  if (device?.prime !== false) return false;
  if (!routesMeta || routesMeta.dongleId !== dongleId) return false;
  if (segmentRange) return false;
  if (typeof limit !== 'number' || limit <= 0) return false;
  if (!(routes.length < limit)) return false;
  return routes.every((r) => r.is_preserved === true);
}

/**
 * Whether to keep the cue visible while routes are unloaded (refetch in flight).
 * @param {object} params
 * @param {{ dongleId: string, filterKey: string }|null|undefined} params.hold
 * @param {Array|null|undefined} params.routes - Hold only when nullish (unloaded).
 * @param {object|null|undefined} params.device
 * @param {string} params.dongleId
 */
export function shouldHoldPreservedRoutesCue({ hold, routes, device, dongleId }) {
  if (!hold) return false;
  if (routes != null) return false;
  if (hold.dongleId !== dongleId) return false;
  if (device?.prime !== false) return false;
  return true;
}

/**
 * Next hold state after context or live-show evaluation.
 * @param {object} params
 * @param {{ dongleId: string, filterKey: string }|null|undefined} params.prevHold
 * @param {boolean} params.showLive - True when the cue would show with loaded routes.
 * @param {string} params.dongleId
 * @param {string} params.filterKey
 * @returns {{ dongleId: string, filterKey: string }|null}
 */
export function nextPreservedCueHold({ prevHold, showLive, dongleId, filterKey }) {
  if (prevHold && (prevHold.dongleId !== dongleId || prevHold.filterKey !== filterKey)) {
    return showLive ? { dongleId, filterKey } : null;
  }
  if (showLive) return { dongleId, filterKey };
  if (prevHold && prevHold.dongleId === dongleId && prevHold.filterKey === filterKey) {
    return prevHold;
  }
  return null;
}
