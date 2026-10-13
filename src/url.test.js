import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parse, toUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

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

describe('url grammar', () => {
  const D2 = '1111bbbb1111bbbb';
  const location = (url) => {
    const [pathname, query] = url.split('?');
    return { pathname, search: query === undefined ? '' : `?${query}` };
  };
  const dest = (fields) => ({
    view: 'dashboard', dongleId: null, log: null, start: null, end: null, settings: null, uploads: false, ...fields,
  });
  const drive = dest({ view: 'drive', dongleId: DONGLE, log: LOG });

  it.each([
    ['/', dest({})],
    ['/referrals', dest({ view: 'referrals' })],
    [`/${DONGLE}`, dest({ dongleId: DONGLE })],
    [`/${DONGLE}/prime`, dest({ view: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, dest({ view: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, drive],
    [`/${DONGLE}/${LOG}/10/20`, { ...drive, start: 10000, end: 20000 }],
    [`/${DONGLE}/${LOG}/0/20`, { ...drive, start: 0, end: 20000 }],
    [`/${DONGLE}/1000/2000`, dest({ view: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 })],
    [`/${DONGLE}/${LOG}?settings=${D2}&uploads`, { ...drive, settings: D2, uploads: true }],
    [`/${DONGLE}?uploads`, dest({ dongleId: DONGLE, uploads: true })],
  ])('round trips %s', (url, expected) => {
    expect(parse(location(url))).toEqual(expected);
    expect(toUrl(expected)).toBe(url);
  });

  it.each([
    [`/${DONGLE}/`, dest({ dongleId: DONGLE })],
    ['/demo', dest({})],
  ])('parses alias %s', (url, expected) => {
    expect(parse(location(url))).toEqual(expected);
  });

  it('rounds zoom outwards', () => {
    expect(toUrl({ ...drive, start: 10500, end: 20300 })).toBe(`/${DONGLE}/${LOG}/10/21`);
  });

  it('keeps start=0 and omits zoom for a whole drive', () => {
    expect(toUrl(drive)).toBe(`/${DONGLE}/${LOG}`);
    expect(toUrl({ ...drive, start: 0, end: 20000 })).toBe(`/${DONGLE}/${LOG}/0/20`);
  });

  it.each([
    '/x/prime',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/${LOG}/1.5/2`,
    `/${DONGLE}/10`,
    `/${DONGLE}/0/20/ignored`,
    '/auth/code/provider',
    '/referrals/x',
  ])('rejects %s', (url) => {
    expect(parse(location(url))).toBeNull();
  });

  it('drops a bogus settings overlay', () => {
    expect(parse(location(`/${DONGLE}?settings=bogus`))).toEqual(dest({ dongleId: DONGLE }));
  });
});
