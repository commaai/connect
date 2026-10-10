import { destinationFromUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  const dest = destinationFromUrl(pathname);
  const isDrive = dest.kind === 'drive';

  return {
    dongleId: dest.dongleId || null,

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

    settingsOpen: dest.kind === 'settings',
    primeNav: dest.kind === 'prime',
    streamNav: dest.kind === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: isDrive && dest.start != null && dest.end != null
      ? { start: dest.start, end: dest.end }
      : null,
    loop: isDrive && dest.start != null && dest.end != null
      ? { startTime: dest.start, duration: dest.end - dest.start }
      : null,
    selectedRouteId: isDrive ? dest.logId : null,
    limit: 0,
  };
}

export default createInitialState();
