import { getDongleID, getZoom, getPrimeNav } from './url';
import * as Demo from './demo';

export function getDefaultFilter() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  let start;
  if (Demo.isDemo()) {
    start = 1564443025000;
  } else {
    start = (new Date(d.getTime() - 1000 * 60 * 60 * 24 * 14)).getTime();
  }

  return {
    start,
    end: d.getTime(),
  }
}

function getDefaultLoop(pathname) {
  // in time instead of offset
  // this makes it so that the timespan can change without this changing
  // thats helpful to shared links and other things probably...
  const zoom = getZoom(pathname);
  if (zoom) {
    return {
      startTime: zoom.start,
      duration: zoom.end - zoom.start,
    };
  }
  return null;
}

export default {
  // dongleId: '99c94dc769b5d96e',
  // dongleId: 'ff83f397542ab647',
  // dongleId: 'f1b4c567731f4a1b',
  dongleId: getDongleID(window.location.pathname),

  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: true, // if we're currently buffering for more data
  offset: null, // in miliseconds, relative to `state.filter.start`
  startTime: Date.now(), // millisecond timestamp in which play began

  routes: null,
  routesMeta: {
    dongleId: null,
    start: null,
    end: null,
  },
  currentRoute: null,

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

  clips: null,

  filter: getDefaultFilter(),
  zoom: getZoom(window.location.pathname),
  loop: getDefaultLoop(window.location.pathname),
};
