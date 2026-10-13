import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, pathFor, locationWithDialog } from './url';

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


describe('route grammar', () => {
  it.each([
    '/', '/demo', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/0/20`, `/${DONGLE}/${LOG}/0.123/1.234`,
    `/${DONGLE}/1000/2000`,
  ])('round-trips %s without losing zero or subsecond bounds', (pathname) => {
    expect(pathFor(parseLocation(pathname))).toBe(pathname);
  });

  it.each([
    `/prefix${DONGLE}`, `/${DONGLE}suffix/prime`, `/invalid/${LOG}`,
    `/${DONGLE}/${LOG}/NaN/20`, `/${DONGLE}/${LOG}/-1/20`,
    `/${DONGLE}/${LOG}/20/10`, `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/${LOG}/1/Infinity`, `/${DONGLE}/${LOG}/1/2/extra`,
    `/${DONGLE}/${LOG}/1e3/2000`, `/${DONGLE}/1000/`,
  ])('rejects malformed routes rather than putting invalid bounds into state (%s)', (pathname) => {
    expect(parseLocation(pathname)).toMatchObject({ page: 'unknown', dongleId: null, routeId: null, zoom: null });
  });

  it('keeps page context, hash, and unrelated arguments when opening and closing dialogs', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/0/20`, search: '?ci=1', hash: '#video' };
    const settings = locationWithDialog(location, 'settings', '1111bbbb1111bbbb');
    expect(parseLocation(settings)).toMatchObject({ page: 'drive', dialog: 'settings', dialogDongleId: '1111bbbb1111bbbb', zoom: { start: 0, end: 20000 } });
    expect(locationWithDialog(settings, null)).toEqual(location);
  });

  it('does not recognize arbitrary dialogs or invalid device targets', () => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=unknown' }).dialog).toBeNull();
    expect(parseLocation({ pathname: '/', search: '?dialog=settings&device=bad' }).dialogDongleId).toBeNull();
  });
});
