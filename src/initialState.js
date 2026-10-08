import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const navigation = parseLocation(location);
  return {
    dongleId: navigation.dongleId,
    navigation,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // observed video position in route milliseconds
    seekVersion: 0,

    routes: null,
    routeCache: {},
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    lastRoutes: null,

    profile: null,
    devices: null,

    primeNav: navigation.view === 'prime',
    streamNav: navigation.view === 'stream',
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
    selectedRouteId: navigation.routeId,
    limit: 0,
  };
}

export default createInitialState();
