import { parseRoute, ROUTES } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const navigation = parseRoute(location);
  return {
    navigation,
    navigationId: 0,
    deviceGeneration: 0,
    dongleId: navigation?.dongleId ?? null,

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

    primeNav: navigation?.type === ROUTES.PRIME,
    streamNav: navigation?.type === ROUTES.STREAM,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: navigation?.type === ROUTES.DRIVE ? navigation.zoom : null,
    loop: null,
    selectedRouteId: navigation?.logId ?? null,
    limit: 0,
  };
}

export default createInitialState();
