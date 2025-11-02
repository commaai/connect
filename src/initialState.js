import { getDongleID } from './url';

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
  offset: null,           // in milliseconds, relative to current loop start or 0
  startTime: Date.now(),  // millisecond timestamp in which play began

  routes: null,
  routesMeta: {
    dongleId: null,
    start: null,
    end: null,
  },
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
  loop: null,
  limit: 0,
};
