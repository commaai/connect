import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, modalUrl, deviceUrl } from './url';

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


describe('location grammar', () => {
  it.each(['-1/20', '20/10', '10/10', 'NaN/20', '0/Infinity', '1e2/200', '0/20/extra'])('rejects invalid drive range %s', (bounds) => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}/${bounds}` }).page).toBe('invalid');
  });
  it('rejects identifiers with extra characters', () => {
    expect(getDongleID(`/prefix${DONGLE}`)).toBeNull();
    expect(getRouteId(`/${DONGLE}/${LOG}suffix`)).toBeNull();
  });
  it('round trips fractional seconds and a zero start', () => {
    const pathname = deviceUrl(DONGLE, 'drive', LOG, 0, 1.234);
    expect(parseLocation({ pathname }).zoom).toEqual({ start: 0, end: 1234 });
  });
  it('recognizes demo drives at initial entry', () => {
    expect(parseLocation({ pathname: `/demo/${LOG}` })).toMatchObject({ dongleId: 'deadbeefdeadbeef', routeId: LOG });
  });
  it('opens a different device settings overlay without changing the drive', () => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}/0/20`, search: '?modal=settings&device=1111bbbb1111bbbb' })).toMatchObject({
      page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 }, modal: 'settings', modalDongleId: '1111bbbb1111bbbb',
    });
  });
  it('preserves other query arguments and the hash when closing a modal', () => {
    expect(modalUrl({ pathname: `/${DONGLE}`, search: '?r=test&modal=settings&device=1111bbbb1111bbbb', hash: '#anchor' })).toBe(`/${DONGLE}?r=test#anchor`);
  });
  it('ignores unknown modals and invalid modal devices', () => {
    expect(parseLocation({ search: '?modal=unknown' }).modal).toBeNull();
    expect(parseLocation({ search: '?modal=settings&device=invalid' }).modal).toBeNull();
    expect(parseLocation({ search: '?modal=pair' }).modal).toBe('pair');
  });
});
