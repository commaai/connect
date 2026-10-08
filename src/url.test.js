import { describe, expect, it } from 'vitest';

import {
  destinationFromUrl,
  getDongleID,
  getPrimeNav,
  getRouteId,
  getRouteZoom,
  getStreamNav,
  getZoom,
  urlForDestination,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL destination grammar', () => {
  it.each([
    ['/', { kind: 'home' }],
    [`/${DONGLE}`, {
      kind: 'dashboard',
      dongleId: DONGLE,
    }],
    [`/${DONGLE}/prime`, {
      kind: 'prime',
      dongleId: DONGLE,
    }],
    [`/${DONGLE}/stream`, {
      kind: 'stream',
      dongleId: DONGLE,
    }],
    [`/${DONGLE}/${LOG}`, {
      kind: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      start: null,
      end: null,
    }],
    [`/${DONGLE}/${LOG}/10/20`, {
      kind: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      start: 10,
      end: 20,
    }],
    [`/${DONGLE}/1000/2000`, {
      kind: 'legacy',
      dongleId: DONGLE,
      start: 1000,
      end: 2000,
    }],
  ])('parses %s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });

  it.each([
    '/not-a-device',
    '/not-a-device/prime',
    `/${DONGLE}/not-a-route`,
    `/${DONGLE}/${LOG}/not-a-number/20`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/10/20/extra`,
  ])('rejects malformed URL %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual({ kind: 'unknown' });
  });

  it('does not interpret auth URLs as application destinations', () => {
    expect(destinationFromUrl('/auth/code/provider')).toEqual({
      kind: 'unknown',
    });
  });
});

describe('URL destination generation', () => {
  it.each([
    ['home', { kind: 'home' }, '/'],
    ['dashboard', {
      kind: 'dashboard',
      dongleId: DONGLE,
    }, `/${DONGLE}`],
    ['prime', {
      kind: 'prime',
      dongleId: DONGLE,
    }, `/${DONGLE}/prime`],
    ['stream', {
      kind: 'stream',
      dongleId: DONGLE,
    }, `/${DONGLE}/stream`],
    ['drive', {
      kind: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      start: null,
      end: null,
    }, `/${DONGLE}/${LOG}`],
    ['drive range', {
      kind: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      start: 10,
      end: 20,
    }, `/${DONGLE}/${LOG}/10/20`],
    ['legacy', {
      kind: 'legacy',
      dongleId: DONGLE,
      start: 1000,
      end: 2000,
    }, `/${DONGLE}/1000/2000`],
  ])('builds %s URL', (_name, destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});

describe('URL round trips', () => {
  it.each([
    '/',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/1000/2000`,
  ])('round trips %s', (pathname) => {
    const destination = destinationFromUrl(pathname);
    expect(urlForDestination(destination)).toBe(pathname);
  });
});

describe('legacy compatibility helpers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/10/20`, { start: 10, end: 20 }],
    [`/${DONGLE}/0/20/ignored`, { start: 0, end: 20 }],
    [`/${DONGLE}/${LOG}/10/20`, {
      start: Number(LOG),
      end: 10,
    }],
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
    [`/${DONGLE}/${LOG}/556/610`, {
      start: 556000,
      end: 610000,
    }],
    [`/${DONGLE}/${LOG}/0/20`, {
      start: 0,
      end: 20000,
    }],
    [`/${DONGLE}/10/20`, null],
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
