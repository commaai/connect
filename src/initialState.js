import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const parsed = parseLocation(typeof location === 'string' ? { pathname: location } : location);
  const view = parsed.ok ? parsed.state : {};
  return {
    dongleId: view.dongleId ?? null,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in miliseconds, relative to state.zoom.start
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
    routeCache: {},
    routeRevision: 0,
    missingRouteId: null,
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    lastRoutes: null,

    profile: null,
    devices: null,

    primeNav: view.page === 'prime',
    streamNav: view.page === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: view.zoom ?? null,
    loop: null,
    selectedRouteId: view.logId ?? null,
    limit: 5,
  };
}

export default createInitialState();
