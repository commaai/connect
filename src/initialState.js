import { getDongleID, getSegmentRange, getPrimeNav, getStreamNav } from './url';

const FIVE_YEARS = 5 * 365 * 24 * 60 * 60 * 1000;

export function getDefaultFilter() {
  const d = new Date();
  const end = d.setHours(d.getHours() + 1, 0, 0, 0);
  const start = end - FIVE_YEARS;

  return {
    start,
    end
  };
}

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

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

    primeNav: getPrimeNav(pathname),
    streamNav: getStreamNav(pathname),
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
    segmentRange: getSegmentRange(pathname),
    limit: 0,
  };
}

export default createInitialState();
