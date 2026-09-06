import { getDongleID, getSegmentRange, getPrimeNav, getStreamNav } from './url';
import { VideoStatus } from './timeline/playback';

export function getDefaultFilter() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return {
    start: (new Date(d.getTime() - 1000 * 60 * 60 * 24 * 14)).getTime(),
    end: d.getTime(),
  };
}

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

    desiredPlaySpeed: 1,    // speed set by user
    isPlaying: true,       // requested play/pause state
    videoStatus: VideoStatus.LOADING,
    hasAudio: false,
    seekRequest: null,
    offset: null,         // milliseconds from the route start

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
