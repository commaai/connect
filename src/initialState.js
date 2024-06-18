import { getDongleID, getSegmentRange, getPrimeNav } from './url';

export function getDefaultFilter() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return {
    start: (new Date(d.getTime() - 1000 * 60 * 60 * 24 * 14)).getTime(),
    end: d.getTime(),
  };
}

export default {
  dongleId: getDongleID(window.location.pathname),

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

  primeNav: getPrimeNav(window.location.pathname),
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
  segmentRange: getSegmentRange(window.location.pathname),
  limit: 0,
};
