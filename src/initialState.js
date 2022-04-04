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
  if (zoom.expanded) {
    return {
      startTime: zoom.start,
      duration: zoom.end - zoom.start,
    };
  }
  return {
    startTime: null,
    duration: null,
  }
}

export default {
  // dongleId: '99c94dc769b5d96e',
  // dongleId: 'ff83f397542ab647',
  // dongleId: 'f1b4c567731f4a1b',
  dongleId: getDongleID(window.location.pathname),

  currentSegment: null,
  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: false, // if we're currently buffering for more data
  offset: 0, // in miliseconds, relative to `state.filter.start`
  startTime: Date.now(), // millisecond timestamp in which play began

  segments: [],
  // this data should come from the API server instead
  // segments: [{
  //   route: '99c94dc769b5d96e|2018-04-09--10-10-00',
  //   offset: 10000,
  //   length: 2558000,
  //   segments: 43
  // }, {
  //   route: '99c94dc769b5d96e|2018-04-09--11-29-08',
  //   offset: 2658000,
  //   length: 214000,
  //   segments: 4
  // }],
  segmentData: null,

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
  zoom: getZoom(window.location.pathname),
  loop: getDefaultLoop(window.location.pathname),
};
