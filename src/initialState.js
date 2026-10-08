import { getDefaultFilter } from './utils/filter';

// The store starts from static defaults. Everything that depends on the URL is
// applied by `syncStateFromUrl` (see src/actions/history.js) once the router
// dispatches its first location, so there is exactly one url -> state path.
export function createInitialState() {
  return {
    dongleId: null,
    destinationKind: null,
    device: null,
    sharedDevice: null,
    deviceNotFound: false,

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

    primeNav: false,
    streamNav: false,
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
    limit: 0,
  };
}

export default createInitialState();
