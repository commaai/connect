const Segments = require('./segments');

const segmentData = [{
  route: '99c94dc769b5d96e|2018-04-09--10-10-00',
  offset: 36600000,
  duration: 2558000,
  segments: 43,
  events: [{
    time: 36600123,
    type: 'event'
  }]
}, {
  route: '99c94dc769b5d96e|2018-04-09--11-29-08',
  offset: 41348000,
  duration: 214000,
  segments: 4,
  events: [{
    time: 41348123,
    type: 'event'
  }]
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
    offset: segmentData[0].offset + segmentData[0].duration - 10,
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
    offset: segmentData[0].offset + segmentData[0].duration - 1000,
    playSpeed: 1,
    startTime: Date.now()
  });
  expect(segment.route).toBe(segmentData[1].route);
  expect(segment.segment).toBe(0);
});

test('adds annotation id when resolved', function () {
  var state = Segments.reducer({
    segments: segmentData
  }, {});
  expect(state.segments[0].events[0].id).toBe(undefined);
  state = Segments.reducer(state, {
    type: 'resolve_annotation',
    route: segmentData[0].route,
    event: segmentData[0].events[0],
    annotation: {
      id: 321
    }
  });
  expect(state.segments[0].events[0].id).toBe(321);
});

test('reducer returns new array when resolving annotations', function () {
  var oldEvents = segmentData[0].events;
  var state = Segments.reducer({
    segments: segmentData
  }, {
    type: 'resolve_annotation',
    route: segmentData[0].route,
    event: segmentData[0].events[0],
    annotation: {
      id: 321
    }
  });
  expect(state.segments === segmentData).toBe(false);
  expect(state.segments[0].route).toBe(segmentData[0].route);
  expect(state.segments[0].events === oldEvents).toBe(false);
});
