import { parse } from '../url';
import { getDefaultFilter } from '../utils/filter';
import { reducer as playbackReducer, resetPlayback, selectLoop } from '../timeline/playback';

const sameRange = (a, b) => a === b || Boolean(a && b && a.start === b.start && a.end === b.end);

// URL -> state. The only writer of navigation state: called for the initial
// state and on every LOCATION_CHANGE. Everything the URL doesn't name is left
// alone, so loaded data survives navigation.
export function applyLocation(prev, location) {
  const { page, dongleId, logId, zoom, modal } = parse(location);
  let state = { ...prev, page, modal };

  if (dongleId && dongleId !== prev.dongleId) {
    state = {
      ...state,
      dongleId,
      device: prev.devices?.find((device) => device.dongle_id === dongleId) || null,
      filter: getDefaultFilter(),
      subscription: null,
      subscribeInfo: null,
      files: null,
      limit: 0,
      routes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      lastRoutes: null,
      currentRoute: null,
    };
  }

  state.selectedRouteId = page === 'drive' ? logId : null;
  if (state.currentRoute?.log_id !== state.selectedRouteId) {
    state.currentRoute = state.routes?.find((route) => route.log_id === state.selectedRouteId) || null;
  }

  const wholeDrive = state.currentRoute ? { start: 0, end: state.currentRoute.duration } : null;
  const nextZoom = page === 'drive' ? (zoom || wholeDrive) : null;
  if (sameRange(nextZoom, prev.zoom) && state.selectedRouteId === prev.selectedRouteId) {
    state.zoom = prev.zoom;
    return state;
  }

  // keep loaded files only when zooming into the current range (a start of 0 counts as a reset, as before)
  const narrowed = state.selectedRouteId === prev.selectedRouteId && prev.zoom && nextZoom?.start
    && nextZoom.start >= prev.zoom.start && nextZoom.end <= prev.zoom.end;
  if (!narrowed) {
    state.files = null;
  }
  state.zoom = nextZoom;
  state = playbackReducer(state, resetPlayback());
  return playbackReducer(state, selectLoop(nextZoom?.start, nextZoom?.end));
}
