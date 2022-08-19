/* eslint-env jest */
import { hasRoutesData, getCurrentRoute, SEGMENT_LENGTH } from './segments';
import { getSegmentNumber } from '../utils';

const routes = [{
  fullname: '99c94dc769b5d96e|2018-04-09--10-10-00',
  offset: 36600000,
  duration: 2558000,
  segment_numbers: Array.from(Array(43).keys()),
  segment_offsets: Array.from(Array(43).keys()).map((i) => i * SEGMENT_LENGTH + 36600000),
  events: [{
    time: 36600123,
    type: 'event'
  }]
}, {
  fullname: '99c94dc769b5d96e|2018-04-09--11-29-08',
  offset: 41348000,
  duration: 214000,
  segment_numbers: Array.from(Array(4).keys()),
  segment_offsets: Array.from(Array(4).keys()).map((i) => i * SEGMENT_LENGTH + 41348000),
  events: [{
    time: 41348123,
    type: 'event'
  }]
}];

describe('segments', () => {
  it('finds current segment', async () => {
    let r = getCurrentRoute({
      routes: routes,
      offset: routes[0].offset,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(r.fullname).toBe(routes[0].fullname);
    expect(getSegmentNumber(r, routes[0].offset)).toBe(0);

    r = getCurrentRoute({
      routes: routes,
      offset: routes[0].offset + SEGMENT_LENGTH * 1.1,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(getSegmentNumber(r, routes[0].offset + SEGMENT_LENGTH * 1.1)).toBe(1);
  });

  it('finds last segment of a route', async () => {
    const offset = routes[0].offset + SEGMENT_LENGTH * (routes[0].segment_offsets.length - 1) + 1000;
    const r = getCurrentRoute({
      routes: routes,
      offset: offset,
      desiredPlaySpeed: 1,
      startTime: Date.now()
    });
    expect(r.fullname).toBe(routes[0].fullname);
    expect(getSegmentNumber(r, offset)).toBe(routes[0].segment_offsets.length - 1);
  });

  it('ends last segment of a route', async () => {
    const offset = routes[0].offset + routes[0].duration - 10;
    const r = getCurrentRoute({
      routes: routes,
      offset: offset,
      desiredPlaySpeed: 1,
      startTime: Date.now() - 50
    });
    expect(getSegmentNumber(r, offset)).toBe(null);
  });

  it('can check if it has segment metadata', () => {
    expect(hasRoutesData()).toBe(false);
    expect(hasRoutesData({})).toBe(false);
    expect(hasRoutesData({
      routesMeta: {},
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf'
      },
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
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
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
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
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
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
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf',
        start: 0,
        end: 30
      },
      filter: {
        start: 10,
        end: 20,
      },
      dongleId: 'asdfasdf',
    })).toBe(true);
  });
});
