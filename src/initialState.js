import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const navigation = parseLocation(location);
  return {
    dongleId: navigation.dongleId,

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

    primeNav: navigation.page === 'prime',
    streamNav: navigation.page === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: navigation.routeZoom,
    loop: null,
    selectedRouteId: navigation.routeId,
    limit: 0,
  };
}

export default createInitialState();
