/* eslint-env jest */
import Segments from './segments';

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

describe('segments', () => {
  it('finds current segment', async () => {
    let segment = Segments.getCurrentSegment({
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

  it('finds last segment of a route', async () => {
    const segment = Segments.getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset + Segments.SEGMENT_LENGTH * (segmentData[0].segments - 1) + 1000,
      playSpeed: 1,
      startTime: Date.now()
    });
    expect(segment.route).toBe(segmentData[0].route);
    expect(segment.segment).toBe(segmentData[0].segments - 1); // 0 indexed
  });

  it('ends last segment of a route', async () => {
    const segment = Segments.getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset + segmentData[0].duration - 10,
      playSpeed: 1,
      startTime: Date.now() - 50
    });
    expect(segment).toBe(null);
  });

  it('finds next segment within route', async () => {
    const segment = Segments.getNextSegment({
      segments: segmentData,
      offset: segmentData[0].offset,
      playSpeed: 1,
      startTime: Date.now()
    });
    expect(segment.route).toBe(segmentData[0].route);
    expect(segment.segment).toBe(1);
  });

  it('finds next segment across routes', async () => {
    const segment = Segments.getNextSegment({
      segments: segmentData,
      offset: segmentData[0].offset + segmentData[0].duration - 1000,
      playSpeed: 1,
      startTime: Date.now()
    });
    expect(segment.route).toBe(segmentData[1].route);
    expect(segment.segment).toBe(0);
  });

  it('adds annotation id when resolved', () => {
    let state = Segments.reducer({
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

  it('reducer returns new array when resolving annotations', () => {
    const oldEvents = segmentData[0].events;
    const state = Segments.reducer({
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

  it('can check if it has segment metadata', () => {
    expect(Segments.hasSegmentMetadata()).toBe(false);
    expect(Segments.hasSegmentMetadata({})).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {}
    })).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf'
      },
    })).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 10,
        end: 20
      },
      start: 0,
      end: 30,
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 0,
        end: 20
      },
      start: 10,
      end: 30,
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 10,
        end: 30
      },
      start: 0,
      end: 20,
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(Segments.hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 0,
        end: 30
      },
      start: 10,
      end: 20,
      dongleId: 'asdfasdf'
    })).toBe(true);
  });
});
