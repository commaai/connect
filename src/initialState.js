import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const route = parseLocation(location);
  return {
    dongleId: route.dongleId,
    deviceSession: 0,
    deviceError: null,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in miliseconds, relative to state.zoom.start
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
    routeCache: {},
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    lastRoutes: null,

    profile: null,
    devices: null,

    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: route.zoom,
    loop: null,
    selectedRouteId: route.selectedRouteId,
    limit: 0,
  };
}

export default createInitialState();
