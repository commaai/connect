import { describe, expect, it } from 'vitest';

import { isPublic, parseLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseLocation', () => {
  it.each([
    ['/', { page: 'root' }],
    ['/demo', { page: 'root' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }],
  ])('%s', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual(expected);
  });

  it.each([
    '/auth/code/provider', '/not-a-device/prime', `/x${DONGLE}`, '/referrals/extra',
  ])('%s is unknown', (pathname) => {
    expect(parseLocation(pathname)).toEqual({ page: 'unknown' });
  });

  it.each([
    `/${DONGLE}/prime/extra`, `/${DONGLE}/${LOG}/20/10`, `/${DONGLE}/${LOG}/10`, `/${DONGLE}/${LOG}/a/b`, `/${DONGLE}/2000/1000`,
  ])('%s is unknown on its device', (pathname) => {
    expect(parseLocation(pathname)).toEqual({ page: 'unknown', dongleId: DONGLE });
  });
});

describe('urlFor', () => {
  it.each([
    '/', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/settings`, `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/0/20`, `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(urlFor(parseLocation(pathname))).toBe(pathname);
  });

  it('rounds a zoom outward to whole seconds', () => {
    expect(urlFor({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10900, end: 20100 } }))
      .toBe(`/${DONGLE}/${LOG}/10/21`);
  });

  it('falls back to the root without a device', () => {
    expect(urlFor({ page: 'prime', dongleId: null })).toBe('/');
  });
});

describe('isPublic', () => {
  it.each([
    [`/${DONGLE}/${LOG}`, true],
    [`/${DONGLE}/1000/2000`, true],
    [`/${DONGLE}`, false],
    [`/${DONGLE}/prime`, false],
  ])('%s', (pathname, expected) => {
    expect(isPublic(parseLocation(pathname))).toBe(expected);
  });
});
