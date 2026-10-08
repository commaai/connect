import { describe, expect, it } from 'vitest';

import { driveUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', {}],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/20/10`, { dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    '/demo',
    `/x${DONGLE}`,
    `/${DONGLE}/unknown`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/2000/1000`,
  ])('%s is not a connect URL', (pathname) => {
    expect(parseUrl(pathname)).toEqual({});
  });
});

describe('driveUrl', () => {
  const route = { dongle_id: DONGLE, log_id: LOG, duration: 60500 };

  it.each([
    ['the whole drive', [], `/${DONGLE}/${LOG}`],
    ['a range', [10400, 20900], `/${DONGLE}/${LOG}/10/20`],
    ['a range from the start', [0, 20000], `/${DONGLE}/${LOG}/0/20`],
    ['a range shorter than a second', [10400, 10800], `/${DONGLE}/${LOG}/10/11`],
    ['a range covering the drive', [0, 60480], `/${DONGLE}/${LOG}`],
  ])('gives %s', (_name, range, expected) => {
    expect(driveUrl(route, ...range)).toBe(expected);
  });
});
