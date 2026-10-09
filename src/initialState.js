import { parse } from './location';
import { DEMO_DONGLE_ID } from './api/demo';
import { getDefaultFilter } from './utils/filter';

// The URL-owned fields of the initial state, from the boot location. Every
// kind fills the same fields the ACTION_APPLY_LOCATION reducer arm will own,
// so the constructor POP that follows finds nothing to change.
function projectInitial(location) {
  switch (location.kind) {
    case 'device':
      return { dongleId: location.dongleId, primeNav: false, streamNav: false, selectedRouteId: null, zoom: null };
    case 'prime':
      return { dongleId: location.dongleId, primeNav: true, streamNav: false, selectedRouteId: null, zoom: null };
    case 'stream':
      return { dongleId: location.dongleId, primeNav: false, streamNav: true, selectedRouteId: null, zoom: null };
    case 'settings':
      return { dongleId: location.dongleId, primeNav: false, streamNav: false, selectedRouteId: null, zoom: null };
    case 'drive':
      return {
        dongleId: location.dongleId,
        primeNav: false,
        streamNav: false,
        selectedRouteId: location.logId,
        zoom: location.zoom,
      };
    case 'legacy':
      return { dongleId: location.dongleId, primeNav: false, streamNav: false, selectedRouteId: null, zoom: null };
    case 'demo':
      // The demo device is the dashboard for /demo; the pathname stays as-is
      // and localStorage.selectedDongleId is not written for it.
      return { dongleId: DEMO_DONGLE_ID, primeNav: false, streamNav: false, selectedRouteId: null, zoom: null };
    default:
      return { dongleId: null, primeNav: false, streamNav: false, selectedRouteId: null, zoom: null };
  }
}

export function createInitialState(pathname = window.location.pathname, search = window.location.search) {
  const initial = projectInitial(parse({ pathname, search }));
  return {
    dongleId: initial.dongleId,

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

    primeNav: initial.primeNav,
    streamNav: initial.streamNav,
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: initial.zoom,
    loop: null,
    selectedRouteId: initial.selectedRouteId,
    limit: 0,
  };
}

export default createInitialState();
