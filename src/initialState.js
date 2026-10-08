import { getDongleID, getRouteId, getRouteZoom, getPrimeNav, getStreamNav } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

    // reported by the video element, see timeline/player.js
    isPaused: true,
    playSpeed: 1,
    isBufferingVideo: true,

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
