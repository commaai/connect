import { applyView } from './applyUrl';
import { parseUrl } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname, search = window.location.search) {
  const state = {
    dongleId: null,

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
    zoom: null,
    loop: null,
    selectedRouteId: null,
    limit: 0,
  };

  // The first paint matches the URL before the router has emitted anything.
  const { patch } = applyView(state, parseUrl(pathname, search || ''));
  return { ...state, ...patch };
}

export default createInitialState();
