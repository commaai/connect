import { destinationFromUrl } from './url';

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

export function getDefaultFilter() {
  const end = new Date().setMinutes(60, 0, 0); // next hour

  return {
    start: end - ONE_YEAR,
    end
  };
}

const initialState = {
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
  deviceNotFound: false,

  primeNav: false,
  streamNav: false,
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
  segmentRange: null,
  limit: 0,
};

export function createInitialState(pathname = window.location.pathname) {
  const state = {
    ...initialState,
    routesMeta: { ...initialState.routesMeta },
    filesUploading: { ...initialState.filesUploading },
    filesUploadingMeta: { ...initialState.filesUploadingMeta },
    filter: getDefaultFilter(),
  };
  const destination = destinationFromUrl(pathname);
  if (destination.dongleId) {
    state.dongleId = destination.dongleId;
    state.primeNav = destination.kind === 'prime';
    state.streamNav = destination.kind === 'stream';
  }
  if (destination.kind === 'drive') {
    state.segmentRange = {
      log_id: destination.logId,
      start: destination.start,
      end: destination.end,
    };
  }
  return state;
}

export default createInitialState();
