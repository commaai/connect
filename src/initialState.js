import { parseUrl } from './url';
import { getDefaultFilter, ROUTE_LIMIT_INCREMENT } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const url = parseUrl(pathname);
  return {
    dongleId: url.dongleId,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in miliseconds, relative to state.zoom.start
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
    routesMeta: {
      dongleId: null,
      routeIds: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    missingRouteId: null,
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
    zoom: url.zoom,
    loop: null,
    selectedRouteId: url.logId,
    limit: ROUTE_LIMIT_INCREMENT,
  };
}

export default createInitialState();
