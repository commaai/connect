import { getDefaultFilter } from './utils/filter';

// The URL fields (dongleId, page, modal, selectedRouteId, zoom) are filled in by the first
// LOCATION_CHANGE, which the router dispatches as soon as it mounts.
export function createInitialState() {
  return {
    dongleId: null,
    page: null,
    modal: null,

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
}

export default createInitialState();
