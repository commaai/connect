const Segments = require('./segments');

const segmentData = [{
  route: '99c94dc769b5d96e|2018-04-09--10-10-00',
  offset: 36600000,
  length: 2558000,
  segments: 43
}, {
  route: '99c94dc769b5d96e|2018-04-09--11-29-08',
  offset: 41348000,
  length: 214000,
  segments: 4
}];

test('finds current segment', async function () {
  var segment = Segments.getCurrentSegment({
    segments: segmentData,
    offset: segmentData[0].offset,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.route).toBe(segmentData[0].route);
  expect(segment.segment).toBe(0);

  segment = Segments.getCurrentSegment({
    segments: segmentData,
    offset: segmentData[0].offset + Segments.SEGMENT_LENGTH * 1.1,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.segment).toBe(1);
});

test('finds last segment of a route', async function () {
  var segment = Segments.getCurrentSegment({
    segments: segmentData,
    offset: segmentData[0].offset + Segments.SEGMENT_LENGTH * (segmentData[0].segments - 1) + 1000,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.route).toBe(segmentData[0].route);
  expect(segment.segment).toBe(segmentData[0].segments - 1); // 0 indexed
});

test('ends last segment of a route', async function () {
  var segment = Segments.getCurrentSegment({
    segments: segmentData,
    offset: segmentData[0].offset + segmentData[0].length - 10,
    playSpeed: 1,
    startTime: Date.now() - 50
  });
  expect(segment).toBe(null);
});

test('finds next segment within route', async function () {
  var segment = Segments.getNextSegment({
    segments: segmentData,
    offset: segmentData[0].offset,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.route).toBe(segmentData[0].route);
  expect(segment.segment).toBe(1);
});

test('finds next segment across routes', async function () {
  var segment = Segments.getNextSegment({
    segments: segmentData,
    offset: segmentData[0].offset + segmentData[0].length - 1000,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.route).toBe(segmentData[1].route);
  expect(segment.segment).toBe(0);
});
