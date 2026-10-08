import { describe, expect, it } from 'vitest';

import {
  buildPath, getDialog, getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parsePathname, withDialog,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it('round-trips every canonical page and a fractional drive range', () => {
    const locations = [
      { page: 'dashboard', dongleId: DONGLE },
      { page: 'settings', dongleId: DONGLE },
      { page: 'prime', dongleId: DONGLE },
      { page: 'stream', dongleId: DONGLE },
      { page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 10500, end: 60500 } },
    ];
    for (const location of locations) {
      expect(parsePathname(buildPath(location))).toMatchObject(location);
    }
  });

  it('validates dialogs against their underlying page and preserves unrelated URL state', () => {
    expect(getDialog(`/${DONGLE}`, '?dialog=filter')).toBe('filter');
    expect(getDialog('/demo', '?dialog=filter')).toBe('filter');
    expect(getDialog(`/${DONGLE}/settings`, '?dialog=filter')).toBeNull();
    expect(withDialog({ pathname: `/${DONGLE}`, search: '?source=test', hash: '#map' }, 'filter'))
      .toBe(`/${DONGLE}?source=test&dialog=filter#map`);
    expect(getDialog(`/${DONGLE}/${LOG}`, `?dialog=unpair&device=${DONGLE}&panel=settings`)).toBe('unpair');
    expect(getDialog(`/${DONGLE}/${LOG}`, '?dialog=unpair')).toBeNull();
  });
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
    [`/${DONGLE}/0/20/ignored`, null],
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

  it('accepts synthetic demo route identifiers', () => {
    expect(getRouteId(`/${DONGLE}/00000000--0000000002`)).toBe('00000000--0000000002');
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
