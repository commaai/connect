import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';

const page = (fields) => ({ page: 'home', dongleId: null, logId: null, range: null, settingsDongleId: null, ...fields });

describe('parseLocation', () => {
  it.each([
    ['/', page({})],
    ['/referrals', page({ page: 'referrals' })],
    ['/auth/', page({ page: 'auth' })],
    [`/${DONGLE}`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, page({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, page({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${HEX_LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG })],
    [`/${DONGLE}/${HEX_LOG}/0/20`, page({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1772040630000/1772041555000`, page({ page: 'legacy', dongleId: DONGLE, range: { start: 1772040630000, end: 1772041555000 } })],
  ])('%s', (pathname, expected) => {
    expect(parseLocation({ pathname, search: '' })).toEqual(expected);
  });
});

describe('urlFor', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${HEX_LOG}`,
    `/${DONGLE}/${HEX_LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(urlFor(parseLocation({ pathname, search: '' }))).toBe(pathname);
  });

  it.each([
    ['/demo', '/'],
    ['/AAAAAAAAAAAAAAAA', '/'],
    [`/${DONGLE}/`, `/${DONGLE}`],
    [`/${DONGLE}/nonsense/path`, `/${DONGLE}`],
    [`/${DONGLE}/prime/extra`, `/${DONGLE}/prime`],
    [`/${DONGLE}/${HEX_LOG}/20/10`, `/${DONGLE}/${HEX_LOG}`],
    [`/${DONGLE}/${HEX_LOG}/abc/def`, `/${DONGLE}/${HEX_LOG}`],
    [`/${DONGLE}/${HEX_LOG}/1.5/20`, `/${DONGLE}/${HEX_LOG}`],
  ])('canonicalizes %s to %s', (pathname, canonical) => {
    expect(urlFor(parseLocation({ pathname, search: '' }))).toBe(canonical);
  });

  it('rounds a drive range outward to whole seconds', () => {
    const location = { page: 'drive', dongleId: DONGLE, logId: HEX_LOG, range: { start: 1500, end: 20200 } };
    expect(urlFor(location)).toBe(`/${DONGLE}/${HEX_LOG}/1/21`);
  });

  it.each([
    [`/${DONGLE}/${HEX_LOG}`, `?settings=${DONGLE}`, `/${DONGLE}/${HEX_LOG}?settings=${DONGLE}`],
    [`/${DONGLE}`, '?settings=not-a-dongle', `/${DONGLE}`],
  ])('keeps a valid settings overlay: %s%s', (pathname, search, expected) => {
    expect(urlFor(parseLocation({ pathname, search }))).toBe(expected);
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
