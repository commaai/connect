import { parseUrl } from './routing/routes';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location) {
  const route = parseUrl(pathname);
  return {
    route,
    deviceCache: {},
    routeEntities: {},
    dongleId: route.dongleId,

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

    primeNav: route.page === 'prime',
    streamNav: route.page === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: route.range,
    loop: null,
    selectedRouteId: route.routeId,
    limit: 0,
  };
}

export default createInitialState();
