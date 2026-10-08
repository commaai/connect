import { parseLocation, Pages } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const { page, dongleId, routeId, zoom } = parseLocation(pathname);

  return {
    dongleId,

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

    page: page === Pages.PRIME || page === Pages.STREAM ? page : Pages.DEVICE,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom,
    loop: null,
    selectedRouteId: routeId,
    limit: 0,
  };
}

export default createInitialState();
