import { destinationFromUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const destination = destinationFromUrl(pathname);

  return {
    dongleId: destination.dongleId ?? null,

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

    primeNav: destination.kind === 'prime',
    streamNav: destination.kind === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: destination.kind === 'drive'
      ? {
          start: destination.start == null && destination.end == null
            ? 0
            : destination.start == null
              ? null
              : destination.start * 1000,
          end: destination.start == null && destination.end == null
            ? 60000
            : destination.end == null
              ? null
              : destination.end * 1000,
        }
      : null,
    loop: null,
    selectedRouteId: destination.kind === 'drive' ? destination.logId : null,
    limit: 0,
  };
}

export default createInitialState();