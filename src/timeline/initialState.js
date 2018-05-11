
module.exports = {
  start: getDefaultStartDate(),
  end: getDefaultEndDate(),

  route: false,
  segment: 0,
  nextSegment: null,
  playSpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  offset: 41348000 - 5000, // in miliseconds from the start
  startTime: Date.now(), // millisecond timestamp in which play began

  // this data should come from the API server instead
  segments: [{
    route: '99c94dc769b5d96e|2018-04-09--10-10-00',
    offset: 36600000,
    length: 2558000,
    segments: 43
  }, {
    route: '99c94dc769b5d96e|2018-04-09--11-29-08',
    offset: 41348000,
    length: 214000,
    segments: 4
  }]
};

function getDefaultStartDate () {
  var d = new Date();
  d.setHours(d.getHours(), 0, 0, 0);

  return new Date(d.getTime() - 1000 * 60 * 60 * 24);
}

function getDefaultEndDate () {
  var d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return d;
}
