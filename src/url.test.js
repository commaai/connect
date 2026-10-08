import { describe, expect, it } from 'vitest';

import { driveUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it.each([
    ['/', {}],
    ['/referrals', {}],
    ['/auth/code/provider', {}],
    ['/not-a-device/prime', {}],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/prime/extra`, { dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, routeId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20/`, { dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/abc/def`, { dongleId: DONGLE, routeId: LOG, zoom: null }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/10`, { dongleId: DONGLE }],
  ])('parseUrl(%s)', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  const route = { dongle_id: DONGLE, log_id: LOG, duration: 60500 };
  it.each([
    ['whole drive', [], `/${DONGLE}/${LOG}`],
    ['full range', [0, 60500], `/${DONGLE}/${LOG}`],
    ['range', [10000, 20000], `/${DONGLE}/${LOG}/10/20`],
    ['zero-start range', [0, 20000], `/${DONGLE}/${LOG}/0/20`],
    ['short range', [10100, 10900], `/${DONGLE}/${LOG}/10/11`],
    ['range to the end', [30000, 60500], `/${DONGLE}/${LOG}/30/60`],
    ['range in the last partial second', [60100, 60500], `/${DONGLE}/${LOG}/59/60`],
  ])('driveUrl for a %s', (_name, range, expected) => {
    expect(driveUrl(route, ...range)).toBe(expected);
  });
});
