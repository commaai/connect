import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  // The URL is parsed exactly once here; every slice of state below comes
  // from that single route object.
  const route = parseLocation(pathname) || {};

  return {
    dongleId: route.dongleId || null,

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
    zoom: (route.page === 'drive' && route.start != null)
      ? { start: route.start * 1000, end: route.end * 1000 }
      : null,
    loop: null,
    selectedRouteId: route.routeId || null,
    limit: 0,
  };
}

export default createInitialState();
