import { getDongleID, getZoom, getPrimeNav } from './url';

function getDefaultStartDate() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return (new Date(d.getTime() - 1000 * 60 * 60 * 24 * 14)).getTime();
}

function getDefaultEndDate() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  // return (new Date(d.getTime() - 1000 * 60 * 60 * 36)).getTime();
  return d.getTime();
}

function getDefaultZoom() {
  const zoom = getZoom(window.location.pathname);
  return {
    ...zoom,
    expanded: (zoom.start !== null && zoom.end !== null),
  };
}

function getDefaultLoop() {
  // in time instead of offset
  // this makes it so that the timespan can change without this changing
  // thats helpful to shared links and other things probably...
  const zoom = getZoom(window.location.pathname);
  if (zoom.start && zoom.end) {
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
  start: getDefaultStartDate(),
  end: getDefaultEndDate(),

  // dongleId: '99c94dc769b5d96e',
  // dongleId: 'ff83f397542ab647',
  // dongleId: 'f1b4c567731f4a1b',
  dongleId: getDongleID(window.location.pathname),

  route: false,
  segment: 0,
  nextSegment: null,
  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: false, // if we're currently buffering for more data
  offset: 0, // in miliseconds from the start
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

  zoom: getDefaultZoom(),
  loop: getDefaultLoop(),
};
