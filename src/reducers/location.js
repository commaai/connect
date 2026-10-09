import { parseUrl } from '../url';
import { getDefaultFilter, LIMIT_INCREMENT } from '../utils/filter';

// zooming in stacks the ranges so the back arrow can step out one level at a time,
// going back to the previous range takes it off the stack again
function stackZoom(zoom, range) {
  if (!range) {
    return null;
  }
  const isRange = (other) => other?.start === range.start && other?.end === range.end;
  if (isRange(zoom)) {
    return zoom;
  }
  return isRange(zoom?.previous) ? zoom.previous : { ...range, previous: zoom };
}

// url -> state. the only place a url is turned into state, on first load and on every change after
export function applyUrl(_state, location) {
  const { page, dongleId, logId = null, start, end, settings } = parseUrl(location);
  let state = _state;

  // only another device clears what was loaded, a url without one keeps the current device
  if (dongleId && dongleId !== state.dongleId) {
    state = {
      ...state,
      dongleId,
      device: state.devices?.find((device) => device.dongle_id === dongleId) || null,
      filter: getDefaultFilter(),
      limit: LIMIT_INCREMENT,
      routes: null,
      lastRoutes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      currentRoute: null,
      selectedRouteId: null,
      zoom: null,
      subscription: null,
      subscribeInfo: null,
    };
  }

  const sameDrive = logId === state.selectedRouteId;
  const currentRoute = (sameDrive && state.currentRoute)
    || state.routes?.find((route) => route.log_id === logId) || null;
  // a drive without a range in its url is shown whole, once its duration is known
  const range = start != null ? { start, end } : currentRoute && { start: 0, end: currentRoute.duration };
  const previousZoom = sameDrive ? state.zoom : null;
  const zoom = stackZoom(previousZoom, range);
  const zoomedIn = zoom && previousZoom && zoom.start >= previousZoom.start && zoom.end <= previousZoom.end;

  return {
    ...state,
    page,
    settingsDongleId: settings,
    selectedRouteId: logId,
    currentRoute,
    zoom,
    files: zoomedIn ? state.files : null,
  };
}
