import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname, search = window.location.search) {
  const navigation = parseLocation({ pathname, search });
  return {
    navigation,
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
    routeNotFound: false,
    lastRoutes: null,

    profile: null,
    devices: null,

    primeNav: navigation.primeNav,
    streamNav: navigation.streamNav,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: navigation.zoom,
    loop: null,
    selectedRouteId: navigation.selectedRouteId,
    limit: 0,
  };
}

export default createInitialState();
