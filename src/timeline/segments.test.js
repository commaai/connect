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
  it('keeps route-only metadata separate from dashboard-list coverage', () => {
    const state = {
      dongleId: 'dongle', routes: [{ log_id: 'log' }], selectedRouteId: 'log',
      routesMeta: { dongleId: 'dongle', start: 0, end: 100, routeId: 'log' },
      filter: { start: 0, end: 100 },
    };
    expect(hasRoutesData(state)).toBe(true);
    expect(hasRoutesData({ ...state, selectedRouteId: null })).toBe(false);
    expect(hasRoutesData({ ...state, selectedRouteId: 'other' })).toBe(false);
    expect(hasRoutesData({ ...state, routes: [] })).toBe(true);
  });

  it('uses a complete cached list only if it contains the requested route', () => {
    const state = {
      dongleId: 'dongle', routes: [{ log_id: 'log' }], selectedRouteId: 'log',
      routesMeta: { dongleId: 'dongle', start: 0, end: 100, routeId: null },
      filter: { start: 0, end: 100 },
    };
    expect(hasRoutesData(state)).toBe(true);
    expect(hasRoutesData({ ...state, selectedRouteId: null })).toBe(true);
    expect(hasRoutesData({ ...state, selectedRouteId: 'other' })).toBe(false);
  });

  it('finds current segment', async () => {
    const [route] = routes;
    expect(getSegmentNumber(route)).toBe(0);
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
