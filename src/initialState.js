import { parseUrl, ROUTES } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  // One parse of the url; every field below reads off the same result, so a
  // cold load and a Back button cannot disagree about what the url means.
  const loc = parseUrl(pathname);

  return {
    dongleId: loc.dongleId,

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

    primeNav: loc.page === ROUTES.PRIME,
    streamNav: loc.page === ROUTES.STREAM,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: loc.page === ROUTES.DRIVE ? loc.zoom : null,
    loop: null,
    selectedRouteId: loc.routeId,
    limit: 0,
  };
}

export default createInitialState();
