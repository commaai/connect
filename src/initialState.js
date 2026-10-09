import { getDongleID, getRouteId, getRouteZoom, getPrimeNav, getStreamNav } from './url';
import { getDefaultFilter } from './utils/filter';
import { VideoStatus } from './timeline/playback';

export function createInitialState(pathname = window.location.pathname) {
  return {
    dongleId: getDongleID(pathname),

    desiredPlaySpeed: 1,    // speed set by user
    isPlaying: true,        // requested play/pause state
    videoStatus: VideoStatus.LOADING,
    hasAudio: false,
    seekRequest: null,      // the last seek, for the video to apply
    offset: null,           // in milliseconds from the start of the route, reported by the video

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
    zoom: getRouteZoom(pathname),
    loop: null,
    selectedRouteId: getRouteId(pathname),
    limit: 0,
  };
}

export default createInitialState();
