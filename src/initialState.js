import { parseUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const url = parseUrl(location);
  return {
    dongleId: url.dongleId,

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
    currentRouteFetched: false,
    lastRoutes: null,

    profile: null,
    devices: null,

    primeNav: url.page === 'prime',
    streamNav: url.page === 'stream',
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
    selectedRouteId: url.routeId,
    limit: 5,
  };
}

export default createInitialState();
