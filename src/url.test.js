import { describe, expect, it } from 'vitest';

import { buildUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NEW_LOG = '0000010a--a51155e496';

describe('parseUrl', () => {
  it.each([
    ['/', {}],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/settings`, { dongleId: DONGLE, page: 'settings' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${NEW_LOG}`, { dongleId: DONGLE, logId: NEW_LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['an unknown page', '/somewhere', {}],
    ['an invalid dongle id', '/not-a-device/prime', {}],
    ['an unknown device page', `/${DONGLE}/elsewhere`, { dongleId: DONGLE }],
    ['a device page with extra parts', `/${DONGLE}/prime/extra`, { dongleId: DONGLE }],
    ['an incomplete zoom', `/${DONGLE}/${LOG}/10`, { dongleId: DONGLE, logId: LOG }],
    ['a backwards zoom', `/${DONGLE}/${LOG}/20/10`, { dongleId: DONGLE, logId: LOG }],
    ['an empty zoom', `/${DONGLE}/${LOG}/12/12`, { dongleId: DONGLE, logId: LOG }],
    ['a non-numeric zoom', `/${DONGLE}/${LOG}/a/b`, { dongleId: DONGLE, logId: LOG }],
    ['an auth callback', '/auth/code/provider', {}],
  ])('ignores %s', (_name, pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });
});

describe('buildUrl', () => {
  it.each([
    [{}, '/'],
    [{ page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE, page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'prime' }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 10600, end: 20400 } }, `/${DONGLE}/${LOG}/10/20`],
  ])('%j', (location, expected) => {
    expect(buildUrl(location)).toBe(expected);
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
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });
});
