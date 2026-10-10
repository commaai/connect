import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { emptyDevice } from '../utils';
import { getDefaultFilter } from '../utils/filter';
import { reducer as playbackReducer, resetPlayback } from '../timeline/playback';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

// URL selection changes are atomic; query-only changes retain the loaded page and player.
export default function locationReducer(state, action) {
  if (action.type !== LOCATION_CHANGE) return state;
  const destination = parseLocation(action.payload.location);
  const dongleId = destination.dongleId || state.dongleId;
  if (dongleId !== state.dongleId) {
    state = {
      ...state, dongleId,
      device: state.devices?.find((device) => device.dongle_id === dongleId) || { ...emptyDevice, dongle_id: dongleId },
      filter: getDefaultFilter(), limit: 5,
      routes: null, lastRoutes: null, routesMeta: { dongleId: null, start: null, end: null },
      selectedRouteId: null, currentRoute: null, currentRouteLoading: false,
      files: null, filesUploading: {}, filesUploadingMeta: { dongleId: null, fetchedAt: null },
      subscription: null, subscribeInfo: null, zoom: null, loop: null,
    };
  }
  const routeId = destination.page === 'drive' ? destination.routeId : null;
  const sameDrive = routeId === state.selectedRouteId;
  const currentRoute = routeId && ((sameDrive && state.currentRoute)
    || state.routes?.find((route) => route.log_id === routeId)) || null;
  const range = routeId && (destination.range || (currentRoute && { start: 0, end: currentRoute.duration })) || null;
  if (sameDrive && sameRange(range, state.zoom)) return state;
  const next = {
    ...state, selectedRouteId: routeId, currentRoute,
    currentRouteLoading: Boolean(routeId && !currentRoute),
    files: sameDrive ? state.files : null,
    zoom: range, loop: range && { startTime: range.start, duration: range.end - range.start },
  };
  return playbackReducer(next, resetPlayback());
}
