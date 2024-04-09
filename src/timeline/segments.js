export function getSegmentFetchRange(state) {
  // TODO: fix this for relative routes
  return state.filter;

  if (!state.zoom) {
    return state.filter;
  }
  if (state.zoom && state.zoom.end < state.filter.start) {
    return {
      start: state.zoom.start,
      end: state.zoom.end,
    };
  }
  const mins = [state.filter.start];
  const maxs = [state.filter.end];
  if (state.zoom) {
    mins.push(state.zoom.start);
    maxs.push(state.zoom.end);
  }
  return {
    start: Math.min(...mins),
    end: Math.max(...maxs),
  };
}

export function hasRoutesData(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (!state.routesMeta || !state.routesMeta.dongleId || state.routesMeta.start === null
    || state.routesMeta.end === null) {
    console.debug('No routes data at all');
    return false;
  }
  if (!state.routes) {
    console.debug('Still loading...');
    return false;
  }
  if (state.dongleId !== state.routesMeta.dongleId) {
    console.debug('Bad dongle id');
    return false;
  }
  const fetchRange = getSegmentFetchRange(state);
  if (fetchRange.start < state.routesMeta.start) {
    console.debug('Bad start offset');
    return false;
  }
  if (fetchRange.end > state.routesMeta.end) {
    console.debug('Bad end offset');
    return false;
  }

  return true;
}
