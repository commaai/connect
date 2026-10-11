import applyDestination from './reducers/destination';
import { destinationFromUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const state = {
    dongleId: null,
    page: 'dashboard',

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
    limit: 0,
  };
  return applyDestination(state, destinationFromUrl(pathname));
}

export default createInitialState();
