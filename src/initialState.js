import { parseUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const location = parseUrl(pathname);
  const drive = location.page === 'drive' ? location : null;
  return {
    dongleId: location.dongleId ?? null,

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
    currentRouteMissing: false,
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
    zoom: drive?.start != null && drive?.end != null
      ? { start: drive.start, end: drive.end }
      : null,
    loop: null,
    selectedRouteId: drive?.logId ?? null,
    limit: 0,
  };
}

export default createInitialState();
