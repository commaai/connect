import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = { pathname: '/' }) {
  const navigation = parseLocation(typeof location === 'string' ? { pathname: location } : location);
  return {
    navigation,
    dongleId: navigation.dongleId,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in milliseconds from the start of the drive
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    routeCache: {},
    lastRoutes: null,

    profile: null,
    devices: null,

    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: navigation.range,
    loop: null,
    limit: 0,
  };
}
