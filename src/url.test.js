import { describe, expect, it } from 'vitest';

import { isLandingUrl, parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NONE = { dongleId: null, logId: null, zoom: null, page: null, legacyRange: null };

describe('parseUrl', () => {
  it.each([
    ['/', {}],
    ['/demo', {}],
    ['/auth/', {}],
    ['/referrals', { page: 'referrals' }],
    ['/referrals/extra', {}],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/settings`, { dongleId: DONGLE, page: 'settings' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/prime/extra`, { dongleId: DONGLE }],
    [`/${DONGLE}/unknown`, { dongleId: DONGLE }],
    ['/not-a-device/prime', {}],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/10`, { dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/1000`, { dongleId: DONGLE }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual({ ...NONE, ...expected });
  });
});

describe('urlFor', () => {
  it.each([
    [{}, '/'],
    [{ page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE, page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'settings' }, `/${DONGLE}/settings`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, page: 'prime' }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 1500, end: 2500 } }, `/${DONGLE}/${LOG}/1/3`],
  ])('%j', (location, expected) => {
    expect(urlFor(location)).toBe(expected);
  });

  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('is the inverse of parseUrl for %s', (pathname) => {
    expect(urlFor(parseUrl(pathname))).toBe(pathname);
  });
});

describe('isLandingUrl', () => {
  it.each([
    ['/', true],
    ['/demo', true],
    ['/demo/', true],
    ['/referrals', false],
    [`/${DONGLE}`, false],
  ])('%s', (pathname, expected) => {
    expect(isLandingUrl(pathname)).toBe(expected);
  });
});
