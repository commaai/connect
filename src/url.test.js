import { describe, expect, it } from 'vitest';

import {
  NOWHERE, formatUrl, parseUrl, getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';
const OTHER_DONGLE = '1111bbbb1111bbbb';

const at = (url) => {
  const { pathname, search } = new URL(url, 'https://connect.comma.ai');
  return { pathname, search };
};

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

describe('parseUrl and formatUrl', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${HEX_LOG}`, { page: 'drive', dongleId: DONGLE, logId: HEX_LOG }],
    [`/${DONGLE}/${HEX_LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: HEX_LOG, start: 0, end: 20000 }],
    [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 556000, end: 610000 }],
    [`/${DONGLE}/1700000000000/1700000060000`, { page: 'legacy', dongleId: DONGLE, startMs: 1700000000000, endMs: 1700000060000 }],
    [`/${DONGLE}?dialog=settings`, { page: 'dashboard', dongleId: DONGLE, dialog: 'settings' }],
    [`/${DONGLE}/${HEX_LOG}?dialog=uploads&device=${OTHER_DONGLE}`, {
      page: 'drive', dongleId: DONGLE, logId: HEX_LOG, dialog: 'uploads', device: OTHER_DONGLE,
    }],
  ])('%s reads and writes the same place', (url, fields) => {
    const place = parseUrl(at(url));
    expect(place).toEqual({ ...NOWHERE, ...fields });
    expect(formatUrl(place)).toBe(url);
  });

  it.each([
    '/demo',
    '/auth/',
    `/${DONGLE}/settings`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE.toUpperCase()}`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}x`,
    `/${DONGLE}/${LOG}/1.5/2`,
  ])('%s is not a page', (url) => {
    expect(parseUrl(at(url))).toEqual({ ...NOWHERE, page: 'not-found' });
  });

  it('reads a trailing slash as the same page', () => {
    expect(parseUrl(at(`/${DONGLE}/${LOG}/`))).toEqual(parseUrl(at(`/${DONGLE}/${LOG}`)));
  });

  it('widens a zoom shorter than a second to whole seconds', () => {
    const place = { ...NOWHERE, page: 'drive', dongleId: DONGLE, logId: LOG, start: 10200, end: 10800 };
    expect(formatUrl(place)).toBe(`/${DONGLE}/${LOG}/10/11`);
  });
});
