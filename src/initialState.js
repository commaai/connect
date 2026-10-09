import { parse } from './location';
import { DEMO_DONGLE_ID } from './api/demo';
import { getDefaultFilter } from './utils/filter';

// The URL-owned fields of the initial state, from the boot location. The
// history middleware's boot POP then walks the same fields through the
// existing thunks; the projection just makes sure they start out matching
// the address bar.
function projectInitial(location) {
  if (location.kind === 'drive') {
    return {
      dongleId: location.dongleId,
      primeNav: false,
      streamNav: false,
      selectedRouteId: location.logId,
      zoom: location.zoom,
    };
  }
  return {
    dongleId: location.dongleId ?? (location.kind === 'demo' ? DEMO_DONGLE_ID : null),
    primeNav: location.kind === 'prime',
    streamNav: location.kind === 'stream',
    selectedRouteId: null,
    zoom: null,
  };
}

export function createInitialState(pathname = window.location.pathname, search = window.location.search) {
  const initial = projectInitial(parse({ pathname, search }));
  // A /demo boot does not write localStorage.selectedDongleId: the demo
  // device is the in-memory session's device, not the user's last real one.
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
