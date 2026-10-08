import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, pathForNavigation, locationForModal } from './url';

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

describe('navigation boundary', () => {
  it.each([
    `/prefix${DONGLE}`, `/${DONGLE}extra`, `/${DONGLE}/${LOG}/0/0`,
    `/${DONGLE}/${LOG}/20/10`, `/${DONGLE}/${LOG}/NaN/20`,
    `/${DONGLE}/${LOG}/Infinity/20`, `/${DONGLE}/-1/20`,
    `/${DONGLE}/${LOG}/1e3/2000`, `/${DONGLE}/${LOG}/0/99999999999999999`,
    `/${DONGLE}/${LOG}/10`, `/${DONGLE}/unknown`, '/%ZZ',
  ])('rejects malformed path %s', (pathname) => {
    expect(parseLocation(pathname)).toMatchObject({ page: 'not-found', dongleId: null, routeId: null, routeZoom: null });
  });

  it.each(['settings', 'unpair', 'settings-uploads', 'uploads', 'add-device'])('round trips a drive with modal %s', (modal) => {
    const pathname = `/${DONGLE}/${LOG}/0/20`;
    const location = locationForModal({ pathname, search: '?ci=1', hash: '#anchor' }, modal, modal.startsWith('settings') || modal === 'unpair' ? DONGLE : null);
    const navigation = parseLocation(location);
    expect(navigation).toMatchObject({ page: 'drive', routeId: LOG, modal, routeZoom: { start: 0, end: 20000 } });
    expect(pathForNavigation(navigation)).toBe(pathname);
    expect(locationForModal(location, null)).toEqual({ pathname, search: '?ci=1', hash: '#anchor' });
  });

  it.each(['?modal=unknown', '?modal=settings&device=invalid', '?modal=settings&modal=uploads', '?modal=filter'])('ignores invalid overlay %s', (search) => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}`, search })).toMatchObject({ page: 'drive', routeId: LOG, modal: null });
  });

  it('round trips millisecond clip ranges without floating point loss', () => {
    const navigation = { dongleId: DONGLE, routeId: LOG, routeZoom: { start: 1001, end: 1101 } };
    expect(parseLocation(pathForNavigation(navigation)).routeZoom).toEqual(navigation.routeZoom);
    expect(parseLocation(`/${DONGLE}/${LOG}/1.0001/2`).page).toBe('not-found');
  });

  it.each(['/', '/demo', '/demo/'])('allows the dashboard filter overlay on home alias %s', (pathname) => {
    expect(parseLocation({ pathname, search: '?modal=filter' })).toMatchObject({ page: 'home', modal: 'filter' });
  });

});
