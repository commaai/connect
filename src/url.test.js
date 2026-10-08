import { describe, expect, it } from 'vitest';

import {
  parseUrl, urlFor, deviceUrl, driveUrl, settingsUrl, primeUrl, streamUrl, currentPage,
  getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl: one grammar for every connect URL', () => {
  it.each([
    ['/', { dongleId: null, page: 'home', logId: null, start: null, end: null, legacy: null }],
    ['/referrals', { dongleId: null, page: 'referrals', logId: null, start: null, end: null, legacy: null }],
    [`/${DONGLE}`, { dongleId: DONGLE, page: 'device', logId: null, start: null, end: null, legacy: null }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime', logId: null, start: null, end: null, legacy: null }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream', logId: null, start: null, end: null, legacy: null }],
    [`/${DONGLE}/settings`, { dongleId: DONGLE, page: 'settings', logId: null, start: null, end: null, legacy: null }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, page: 'drive', logId: LOG, start: null, end: null, legacy: null }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, page: 'drive', logId: LOG, start: 556000, end: 610000, legacy: null }],
    // zero-start zooms keep their range (reload-safe)
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, page: 'drive', logId: LOG, start: 0, end: 20000, legacy: null }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, page: 'device', logId: null, start: null, end: null, legacy: { start: 1000, end: 2000 } }],
  ])('parseUrl(%s)', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['/not-a-device/prime', 'home'],
    [`/${DONGLE}/prime/extra`, 'device'],
    [`/${DONGLE}/stream/extra`, 'device'],
    ['/auth/code/provider', 'home'],
    // old getZoom bug: drive zoom must not parse the log id as a number
    [`/${DONGLE}/${LOG}/10/20`, 'drive'],
  ])('rejects %s as %s (exact match, no NaN zooms)', (pathname, page) => {
    expect(parseUrl(pathname).page).toBe(page);
    expect(parseUrl(pathname).start).not.toBeNaN();
  });

  it('anchored dongle ids: substrings do not match', () => {
    expect(parseUrl(`/xx${DONGLE}xx`).dongleId).toBeNull();
    expect(parseUrl(`/${DONGLE}`).dongleId).toBe(DONGLE);
  });
});

describe('urlFor: inverse of parseUrl', () => {
  it.each([
    [{ dongleId: DONGLE, page: 'device' }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'prime' }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: 'stream' }, `/${DONGLE}/stream`],
    [{ dongleId: DONGLE, page: 'settings' }, `/${DONGLE}/settings`],
    [{ dongleId: DONGLE, page: 'drive', logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, page: 'drive', logId: LOG, start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, page: 'drive', logId: LOG, start: 556000, end: 610000 }, `/${DONGLE}/${LOG}/556/610`],
  ])('urlFor(%j)', (args, expected) => {
    expect(urlFor(args)).toBe(expected);
    // round-trips through parseUrl
    expect(parseUrl(expected)).toMatchObject({
      dongleId: args.dongleId, page: args.page, logId: args.logId ?? null,
    });
  });

  it('helpers build the same URLs', () => {
    expect(deviceUrl(DONGLE)).toBe(`/${DONGLE}`);
    expect(driveUrl(DONGLE, LOG)).toBe(`/${DONGLE}/${LOG}`);
    expect(driveUrl(DONGLE, LOG, 0, 20000)).toBe(`/${DONGLE}/${LOG}/0/20`);
    expect(settingsUrl(DONGLE)).toBe(`/${DONGLE}/settings`);
    expect(primeUrl(DONGLE)).toBe(`/${DONGLE}/prime`);
    expect(streamUrl(DONGLE)).toBe(`/${DONGLE}/stream`);
    expect(currentPage(`/${DONGLE}/settings`)).toBe('settings');
  });
});

describe('back-compat wrappers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/1000/2000`, { start: 1000, end: 2000 }],
    [`/${DONGLE}/${LOG}/10/20`, null],
    [`/${DONGLE}/10`, null],
    ['/auth/code/provider', null],
  ])('getZoom(%s)', (pathname, expected) => {
    expect(getZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, LOG],
    [`/${DONGLE}/${LOG}/10/20`, LOG],
    [`/${DONGLE}/prime`, null],
    [`/${DONGLE}`, null],
  ])('getRouteId(%s)', (pathname, expected) => {
    expect(getRouteId(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/556/610`, { start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { start: 0, end: 20000 }],
    [`/${DONGLE}/1000/2000`, null],
  ])('getRouteZoom(%s)', (pathname, expected) => {
    expect(getRouteZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/prime`, true],
    [`/${DONGLE}/prime/extra`, false],
    ['/not-a-device/prime', false],
    [`/${DONGLE}/stream`, false],
  ])('getPrimeNav(%s)', (pathname, expected) => {
    expect(getPrimeNav(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/stream`, true],
    [`/${DONGLE}/stream/extra`, false],
    ['/not-a-device/stream', false],
    [`/${DONGLE}/prime`, false],
  ])('getStreamNav(%s)', (pathname, expected) => {
    expect(getStreamNav(pathname)).toBe(expected);
  });
});
