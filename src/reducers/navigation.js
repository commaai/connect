import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { getDefaultFilter } from '../utils/filter';
import { emptyDevice } from '../utils';

function sameRange(a, b) {
  return a?.start === b?.start && a?.end === b?.end;
}

function driveRange(range, route) {
  if (!route) return range;
  if (!range || range.start >= route.duration) return { start: 0, end: route.duration };
  return { start: range.start, end: Math.min(range.end, route.duration) };
}

// Called after navigation or route metadata changes. Query changes leave playback untouched.
export function selectCurrentRoute(state) {
  const { routeId, range } = state.navigation;
  const currentRoute = routeId ? state.routeCache[routeId] || null : null;
  const zoom = routeId ? driveRange(range, currentRoute) : null;
  if (state.currentRoute === currentRoute && sameRange(state.zoom, zoom)) return state;
  const changedDrive = state.currentRoute?.fullname !== currentRoute?.fullname;
  return {
    ...state,
    currentRoute,
    zoom: sameRange(state.zoom, zoom) ? state.zoom : zoom,
    ...(changedDrive || !sameRange(state.zoom, zoom) ? {
      loop: zoom ? { startTime: zoom.start, duration: zoom.end - zoom.start } : null,
      offset: zoom?.start ?? null,
      startTime: Date.now(),
      desiredPlaySpeed: zoom ? 1 : 0,
      isBufferingVideo: true,
    } : {}),
  };
}

export default function navigationReducer(state, action) {
  if (action.type !== LOCATION_CHANGE) return state;
  const navigation = parseLocation(action.payload.location);
  // Account pages have no device argument. Retain the user's device context there.
  const dongleId = navigation.dongleId || state.dongleId;
  if (dongleId !== state.dongleId) {
    state = {
      ...state,
      dongleId,
      device: state.devices?.find((device) => device.dongle_id === dongleId)
        || { ...emptyDevice, dongle_id: dongleId },
      filter: getDefaultFilter(),
      routes: null,
      lastRoutes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      routeCache: {},
      subscription: null,
      subscribeInfo: null,
      files: null,
      filesUploading: {},
      filesUploadingMeta: { dongleId: null, fetchedAt: null },
      limit: 0,
    };
  }
  return selectCurrentRoute({ ...state, navigation });
}
