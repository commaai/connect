/* eslint-env jest */
import { hasRoutesData } from './segments';

export const SEGMENT_LENGTH = 1000 * 60;

describe('segments', () => {
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