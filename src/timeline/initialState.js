
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

module.exports = {
  start: getDefaultStartDate(),
  end: getDefaultEndDate(),

  // dongleId: '99c94dc769b5d96e',
  // dongleId: 'ff83f397542ab647',
  // dongleId: 'f1b4c567731f4a1b',
  dongleId: null,

  route: false,
  segment: 0,
  nextSegment: null,
  playSpeed: 0, // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  desiredPlaySpeed: 0, // the speed the user has selected so that buffering can resume
  shouldBuffer: true, // if we should bother waiting for buffered data or just roll on
  bufferingVideo: false, // if we're currently buffering for more data
  bufferingData: false, // if we're currently buffering for more data
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

  loop: {
    // in time instead of offset
    // this makes it so that the timespan can change without this changing
    // thats helpful to shared links and other things probably...
    startTime: null,
    duration: null
  },

  profile: {},
  devices: [],
  isDemo: false,
};
