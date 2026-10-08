import { describe, expect, it } from 'vitest';

import {
  destinationFromUrl,
  urlForDestination,
  getDongleID,
  getZoom,
  getRouteId,
  getRouteZoom,
  getPrimeNav,
  getStreamNav,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('destinationFromUrl', () => {
  it.each([
    ['/', { kind: 'root' }],
    ['', { kind: 'root' }],
    ['/referrals', { kind: 'referrals' }],
    [`/${DONGLE}`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { kind: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { kind: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { kind: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: 10000, end: 20000 }],
    [`/${DONGLE}/1690000000000/1690001000000`, { kind: 'legacy', dongleId: DONGLE, start: 1690000000000, end: 1690001000000 }],
    ['/not-a-dongle', { kind: 'not-found' }],
    [`/${DONGLE}/unknown/extra`, { kind: 'not-found' }],
    [`/${DONGLE}/${LOG}/20/10`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }],
    [`/${DONGLE}/200/100`, { kind: 'not-found' }],
  ])('destinationFromUrl(%s)', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });
});

describe('urlForDestination', () => {
  it.each([
    [{ kind: 'root' }, '/'],
    [{ kind: 'referrals' }, '/referrals'],
    [{ page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE, page: 'dashboard' }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'settings' }, `/${DONGLE}/settings`],
    [{ dongleId: DONGLE, page: 'prime' }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: 'stream' }, `/${DONGLE}/stream`],
    [{ dongleId: DONGLE, page: 'drive', drive: { logId: LOG } }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ dongleId: null }, '/'],
    [null, '/'],
  ])('urlForDestination(%o)', (destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});

describe('URL pathname helpers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it('returns null if a pathname segment disappears while it is read', () => {
    let reads = 0;
    const parts = [];
    Object.defineProperty(parts, 0, { get: () => ((reads += 1) === 1 ? DONGLE : '') });
    const pathname = { split: () => ({ filter: () => parts }) };
    expect(getDongleID(pathname)).toBeNull();
  });

  it.each([
    [`/${DONGLE}/10/20`, { start: 10, end: 20 }],
    [`/${DONGLE}/0/20/ignored`, { start: 0, end: 20 }],
    [`/${DONGLE}/${LOG}/10/20`, { start: Number(LOG), end: 10 }],
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
