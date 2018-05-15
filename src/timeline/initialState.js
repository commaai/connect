
module.exports = {
  start: getDefaultStartDate(),
  end: getDefaultEndDate(),

  dongleId: '99c94dc769b5d96e',

  route: false,
  segment: 0,
  nextSegment: null,
  playSpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  offset: 414619434 - 5000, // in miliseconds from the start
  startTime: Date.now(), // millisecond timestamp in which play began

  // this data should come from the API server instead
  segments: null,
  segmentData: null
};

function getDefaultStartDate () {
  var d = new Date();
  d.setHours(d.getHours(), 0, 0, 0);

  return new Date(d.getTime() - 1000 * 60 * 60 * 24 * 7);
}

function getDefaultEndDate () {
  var d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return d;
}
