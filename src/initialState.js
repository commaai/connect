import { getDongleID, getRouteId, getRouteZoom, getPrimeNav, getStreamNav } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

    desiredPlaySpeed: 1,    // 0 is paused
    isBufferingVideo: true,
    offset: null,           // last seek, ms from the route start
    startTime: Date.now(),  // last seek; the map flies when this changes

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

    primeNav: getPrimeNav(pathname),
    streamNav: getStreamNav(pathname),
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: getRouteZoom(pathname),
    loop: null,
    selectedRouteId: getRouteId(pathname),
    limit: 0,
  };
}

export default createInitialState();
