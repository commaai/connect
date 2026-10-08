import { getDefaultFilter, ROUTES_LIMIT_INCREMENT } from './utils/filter';

// The URL is applied on top of this by applyUrl(), see actions/history.js.
export function createInitialState() {
  return {
    dongleId: null,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in miliseconds, relative to state.zoom.start
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
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
    zoom: null,
    loop: null,
    selectedRouteId: null,
    limit: ROUTES_LIMIT_INCREMENT,
  };
}

export default createInitialState();
