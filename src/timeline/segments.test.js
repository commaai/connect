/* eslint-env jest */
import { hasSegmentMetadata, getCurrentSegment, SEGMENT_LENGTH } from './segments';

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
    let segment = getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(segment.route).toBe(segmentData[0].route);
    expect(segment.segment).toBe(0);

    segment = getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset + SEGMENT_LENGTH * 1.1,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(segment.segment).toBe(1);
  });

  it('finds last segment of a route', async () => {
    const segment = getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset + SEGMENT_LENGTH * (segmentData[0].segments - 1) + 1000,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(segment.route).toBe(segmentData[0].route);
    expect(segment.segment).toBe(segmentData[0].segments - 1); // 0 indexed
  });

  it('ends last segment of a route', async () => {
    const segment = getCurrentSegment({
      segments: segmentData,
      offset: segmentData[0].offset + segmentData[0].duration - 10,
      desiredPlaySpeed: 1,
      startTime: Date.now() - 50
    });
    expect(segment).toBe(null);
  });

  it('can check if it has segment metadata', () => {
    expect(hasSegmentMetadata()).toBe(false);
    expect(hasSegmentMetadata({})).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {}
    })).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf'
      },
    })).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 10,
        end: 20
      },
      filter: {
        start: 0,
        end: 30,
      },
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 0,
        end: 20
      },
      filter: {
        start: 10,
        end: 30,
      },
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 10,
        end: 30
      },
      filter: {
        start: 0,
        end: 20,
      },
      dongleId: 'asdfasdf'
    })).toBe(false);
    expect(hasSegmentMetadata({
      segmentData: {
        segments: [],
        dongleId: 'asdfasdf',
        start: 0,
        end: 30
      },
      filter: {
        start: 10,
        end: 20,
      },
      dongleId: 'asdfasdf'
    })).toBe(true);
  });
});
