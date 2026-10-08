import { getDefaultFilter, LIMIT_INCREMENT } from './utils/filter';

// Navigation fields stay empty until the router reports the first location.
export function createInitialState() {
  return {
    page: null,
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
    currentRouteMissing: false,
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
    modal: null,
    modalDongleId: null,
    limit: LIMIT_INCREMENT,
  };
}

export default createInitialState();
