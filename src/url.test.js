import { describe, expect, it } from 'vitest';

import { buildUrl, isShareable, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', { page: 'home', dongleId: null }],
    ['', { page: 'home', dongleId: null }],
    ['/prime', { page: 'home', dongleId: null }],
    ['/not-a-device/prime', { page: 'home', dongleId: null }],
    ['/auth/code/provider', { page: 'home', dongleId: null }],
    ['/referrals', { page: 'referrals', dongleId: null }],
    ['/referrals/extra', { page: 'home', dongleId: null }],
    [`/${DONGLE}`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/unknown`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/10`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}${DONGLE}`, { page: 'home', dongleId: null }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/556/610`, { start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { start: 0, end: 20000 }],
    [`/${DONGLE}/${LOG}/10`, null],
    [`/${DONGLE}/${LOG}/10/x`, null],
  ])('drive %s', (pathname, range) => {
    expect(parseUrl(pathname)).toEqual({ page: 'drive', dongleId: DONGLE, routeId: LOG, range });
  });

  it.each([
    [`/${DONGLE}/1565900000000/1565900500000`, { start: 1565900000000, end: 1565900500000 }],
    [`/${DONGLE}/10/20/ignored`, { start: 10, end: 20 }],
  ])('legacy range %s', (pathname, range) => {
    expect(parseUrl(pathname)).toEqual({ page: 'legacyRange', dongleId: DONGLE, range });
  });
});

describe('buildUrl', () => {
  it.each([
    [{ page: 'home' }, '/'],
    [{ page: 'referrals' }, '/referrals'],
    [{ page: 'device', dongleId: null }, '/'],
    [{ page: 'prime', dongleId: null }, '/'],
    [{ page: 'device', dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: 'settings', dongleId: DONGLE }, `/${DONGLE}/settings`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, range: null }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 10000, end: 20999 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ page: 'legacyRange', dongleId: DONGLE, range: { start: 1000, end: 2000 } }, `/${DONGLE}/1000/2000`],
  ])('%j', (destination, expected) => {
    expect(buildUrl(destination)).toBe(expected);
  });
});

describe('parseUrl and buildUrl', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/1565900000000/1565900500000`,
  ])('are inverses for %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });
});

describe('isShareable', () => {
  it.each([
    [`/${DONGLE}/${LOG}`, true],
    [`/${DONGLE}/${LOG}/10/20`, true],
    [`/${DONGLE}/10/20`, true],
    [`/${DONGLE}`, false],
    [`/${DONGLE}/settings`, false],
    ['/referrals', false],
    ['/', false],
  ])('%s', (pathname, expected) => {
    expect(isShareable(parseUrl(pathname))).toBe(expected);
  });
});
