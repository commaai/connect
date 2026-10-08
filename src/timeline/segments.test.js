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

  it.each([
    ['a drive list containing the selected drive', 'log', null, ['log'], true],
    ['a drive list missing the selected drive', 'log', null, ['other'], false],
    ['a single-drive fetch for the selected drive', 'log', 'log', [], true],
    ['a single-drive fetch once nothing is selected', null, 'log', ['log'], false],
  ])('checks routes against %s', (_name, selectedRouteId, logId, logIds, expected) => {
    expect(hasRoutesData({
      dongleId: 'asdfasdf',
      selectedRouteId,
      missingRouteId: logId,
      filter: { start: 0, end: 30 },
      routesMeta: { dongleId: 'asdfasdf', start: logId ? null : 0, end: logId ? null : 30 },
      routes: logIds.map((log_id) => ({ log_id })),
    })).toBe(expected);
  });
});
