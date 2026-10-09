import { parsePath } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const parsed = parsePath(pathname, typeof window !== 'undefined' ? window.location?.search : '');

  return {
    dongleId: parsed.dongleId,

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

    primeNav: parsed.primeNav,
    streamNav: parsed.streamNav,
    settingsNav: parsed.settingsNav,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: parsed.zoom,
    loop: null,
    selectedRouteId: parsed.routeId,
    limit: 0,
  };
}

export default createInitialState();
