import { getDongleID, getRouteId, getRouteZoom, getPrimeNav, getStreamNav } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // last observed video position, in milliseconds from route start
    seekRequest: { id: 0, offset: 0 }, // requested video position, acknowledged by media events
    playbackRoute: null,   // route associated with the observed video position

    routes: null,
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
      routeId: null,
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
