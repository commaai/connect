import { getDefaultFilter } from './utils/filter';

// The initial state is intentionally blank: syncStateFromUrl applies whatever
// the current URL describes on boot, like any other location change.
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
    urlRange: null,
    selectedRouteId: null,
    missingRouteId: null,

    profile: null,
    devices: null,
    deviceNotFound: false,

    primeNav: false,
    streamNav: false,
    referralsNav: false,
    modal: null,
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
    limit: 0,
  };
}

export default createInitialState();
