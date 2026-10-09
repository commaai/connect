import { parseUrl, parseFilter } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname, search = window.location.search) {
  const url = parseUrl(pathname);
  return {
    dongleId: url.dongleId,

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

    filter: parseFilter(search) || getDefaultFilter(),
    zoom: url.zoom,
    loop: null,
    selectedRouteId: url.logId,
    limit: 0,
  };
}

export default createInitialState();
