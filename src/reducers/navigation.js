import { sameRange } from '../url';
import { emptyDevice } from '../utils';
import { getDefaultFilter } from '../utils/filter';

// Navigation owns selection. Data and playback survive changes that do not affect them.
export function applyNavigation(state, navigation) {
  const dongleId = navigation.dongleId || state.dongleId;
  const deviceChanged = dongleId !== state.dongleId;
  if (deviceChanged) {
    state = {
      ...state, dongleId,
      device: state.devices?.find((device) => device.dongle_id === dongleId)
        || { ...emptyDevice, dongle_id: dongleId },
      filter: getDefaultFilter(), limit: 0, routes: null, lastRoutes: null, routeCache: {},
      routesMeta: { dongleId: null, start: null, end: null },
      subscription: null, subscribeInfo: null, files: null, filesUploading: {},
      filesUploadingMeta: { dongleId: null, fetchedAt: null },
    };
  }
  const currentRoute = navigation.page === 'drive'
    ? state.routeCache[navigation.logId] || state.routes?.find((route) => route.log_id === navigation.logId) || null
    : null;
  const range = navigation.range;
  const zoom = currentRoute
    ? (range && range.end <= currentRoute.duration ? range : { start: 0, end: currentRoute.duration })
    : navigation.page === 'drive' ? range : null;
  const driveChanged = deviceChanged || navigation.logId !== state.navigation.logId
    || (navigation.page === 'legacy' && !sameRange(navigation.legacy, state.navigation.legacy));
  const rangeChanged = !sameRange(zoom, state.zoom);
  return {
    ...state, navigation, currentRoute,
    zoom: rangeChanged ? zoom : state.zoom,
    ...(driveChanged ? { files: null, routeError: null } : {}),
    ...(driveChanged || rangeChanged || (zoom && !state.loop) ? {
      offset: zoom?.start ?? null, startTime: Date.now(), isBufferingVideo: true,
      desiredPlaySpeed: 1,
      loop: zoom ? { startTime: zoom.start, duration: zoom.end - zoom.start } : null,
    } : {}),
  };
}
