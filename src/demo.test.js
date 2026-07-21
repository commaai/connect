import {
  createDemoRoutes,
  DEMO_SOURCE_ROUTE,
  rewriteDemoPlaylist,
  transformRouteCoords,
  transformRouteEvents,
} from './demo';
import { getDongleID, getSegmentRange } from './url';

const source = {
  fullname: DEMO_SOURCE_ROUTE,
  create_time: 10,
  start_time_utc_millis: 1000,
  end_time_utc_millis: 5000,
  segment_numbers: [0, 1, 2, 3, 4, 5],
  segment_start_times: [1000, 2000, 3000, 4000, 5000, 6000],
  segment_end_times: [2000, 3000, 4000, 5000, 6000, 7000],
};

test('creates independent demo routes with aligned segment metadata', () => {
  const routes = createDemoRoutes(source);

  expect(routes).toHaveLength(6);
  expect(routes[0].segment_numbers).toEqual(source.segment_numbers);
  expect(routes[5]).toMatchObject({
    start_lat: null,
    start_lng: null,
    end_lat: null,
    end_lng: null,
  });
  routes.forEach((route) => {
    expect(route.segment_numbers).toEqual(source.segment_numbers);
    expect(Object.keys(route).filter((key) => key.startsWith('demo'))).toEqual([]);
  });
  expect(transformRouteEvents(routes[3], 0, ['event'])).toEqual([]);
  expect(transformRouteEvents(routes[3], 1, ['event'])).toEqual(['event']);
  expect(transformRouteEvents(routes[4], 3, ['event'])).toEqual([]);
  expect(transformRouteCoords(routes[5], { 1: [2, 3] })).toEqual({});
  expect(transformRouteCoords(routes[0], { 1: [2, 3] })).toEqual({ 1: [2, 3] });
});

test('rewrites only unavailable video segments', () => {
  const playlist = [
    '#EXTM3U',
    'https://example/0/qcamera.ts?sig=keep&exp=1',
    'https://example/1/qcamera.ts?sig=replace&exp=1',
  ].join('\n');

  expect(rewriteDemoPlaylist(playlist, [0])).toBe([
    '#EXTM3U',
    'https://example/0/qcamera.ts?sig=keep&exp=1',
    'https://example/1/qcamera.ts?sig=intentionally-missing&exp=1',
  ].join('\n'));
});

test('recognizes demo list and route URLs', () => {
  expect(getDongleID('/demo')).toBe('demo');
  expect(getDongleID('/demo/0000010a--a51155e490')).toBe('demo');
  expect(getSegmentRange('/demo/0000010a--a51155e490')).toEqual({
    log_id: '0000010a--a51155e490',
    start: NaN,
    end: NaN,
  });
});
