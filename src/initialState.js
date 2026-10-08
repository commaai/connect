import { parseLocation } from './url';
import { getDefaultFilter } from './utils/filter';

// Seed the store from the entry URL; the history middleware keeps it in sync from then on.
export function createInitialState(pathname = window.location.pathname) {
  const { dongleId, logId, range } = parseLocation({ pathname });
  return {
    dongleId,

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

    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: logId ? range : null,
    loop: null,
    selectedRouteId: logId,
    limit: 0,
  };
}

export default createInitialState();
