/* eslint-env jest */
import { getCurrentRoute } from '.';
import { hasRoutesData } from './segments';
import { getSegmentNumber } from '../utils';

export const SEGMENT_LENGTH = 1000 * 60;

const routes = [{
  fullname: '99c94dc769b5d96e|2018-04-09--10-10-00',
  offset: 36600000,
  duration: 2558000,
  segment_numbers: Array.from(Array(43).keys()),
  segment_offsets: Array.from(Array(43).keys()).map((i) => i * SEGMENT_LENGTH + 36600000),
  events: [{
    time: 36600123,
    type: 'event',
  }],
}, {
  fullname: '99c94dc769b5d96e|2018-04-09--11-29-08',
  offset: 41348000,
  duration: 214000,
  segment_numbers: Array.from(Array(4).keys()),
  segment_offsets: Array.from(Array(4).keys()).map((i) => i * SEGMENT_LENGTH + 41348000),
  events: [{
    time: 41348123,
    type: 'event',
  }],
}];

describe('segments', () => {
  it('finds current segment', async () => {
    const [route] = routes;
    let r = getCurrentRoute({
      routes,
      offset: route.offset,
      desiredPlaySpeed: 1,
      startTime: Date.now(),
    });
    expect(r.fullname).toBe(route.fullname);
    expect(getSegmentNumber(r, route.offset)).toBe(0);

    r = getCurrentRoute({
      routes,
      offset: route.offset + SEGMENT_LENGTH * 1.1,
      desiredPlaySpeed: 1,
      startTime: Date.now(),
    });
    expect(getSegmentNumber(r, route.offset + SEGMENT_LENGTH * 1.1)).toBe(1);
  });

  it('finds last segment of a route', async () => {
    const [route] = routes;
    const offset = route.offset + SEGMENT_LENGTH * (route.segment_offsets.length - 1) + 1000;
    const r = getCurrentRoute({
      routes,
      offset,
      desiredPlaySpeed: 1,
      startTime: Date.now(),
    });
    expect(r.fullname).toBe(route.fullname);
    expect(getSegmentNumber(r, offset)).toBe(route.segment_offsets.length - 1);
  });

  it('ends last segment of a route', async () => {
    const [route] = routes;
    const offset = route.offset + route.duration - 10;
    const r = getCurrentRoute({
      routes,
      offset,
      desiredPlaySpeed: 1,
      startTime: Date.now() - 50,
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
        dongleId: 'asdfasdf',
      },
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf',
        start: 10,
        end: 20,
      },
      filter: {
        start: 0,
        end: 30,
      },
      dongleId: 'asdfasdf',
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf',
        start: 0,
        end: 20,
      },
      filter: {
        start: 10,
        end: 30,
      },
      dongleId: 'asdfasdf',
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf',
        start: 10,
        end: 30,
      },
      filter: {
        start: 0,
        end: 20,
      },
      dongleId: 'asdfasdf',
    })).toBe(false);
    expect(hasRoutesData({
      routes: [],
      routesMeta: {
        dongleId: 'asdfasdf',
        start: 0,
        end: 30,
      },
      filter: {
        start: 10,
        end: 20,
      },
      dongleId: 'asdfasdf',
    })).toBe(true);
  });
});
