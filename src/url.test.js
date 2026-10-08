import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, pathForNavigation, locationWithPath, locationWithModal } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
    [`/x${DONGLE}`, null],
    [`/${DONGLE}x`, null],
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

  it.each(['NaN/20', 'Infinity/20', '-1/20', '20/10', '10/10', '1e309/20', '10/nope'])('rejects invalid bounds %s', (bounds) => {
    expect(getZoom(`/${DONGLE}/${bounds}`)).toBeNull();
    expect(getRouteZoom(`/${DONGLE}/${LOG}/${bounds}`)).toBeNull();
    expect(parseLocation(`/${DONGLE}/${LOG}/${bounds}`)).toMatchObject({ valid: false, routeId: null, zoom: null });
  });

  it('parses demo routes and URL overlays without changing drive bounds', () => {
    const navigation = parseLocation({ pathname: `/demo/${DONGLE}/${LOG}/0/20`, search: '?modal=settings&device=1111bbbb1111bbbb' });
    expect(navigation).toMatchObject({ demo: true, view: 'drive', routeId: LOG,
      zoom: { start: 0, end: 20000 }, modal: 'settings', modalDeviceId: '1111bbbb1111bbbb' });
    expect(pathForNavigation(navigation)).toBe(`/demo/${DONGLE}/${LOG}/0/20`);
  });

  it('only accepts overlays valid for the underlying view', () => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?modal=downloads' }).modal).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?modal=settings&device=invalid' }).modal).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?modal=prime-cancel' }).modal).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}/prime`, search: '?modal=prime-cancel' }).modal).toBe('prime-cancel');
    expect(parseLocation({ pathname: '/', search: '?modal=pair' }).modal).toBe('pair');
    expect(parseLocation({ pathname: '/demo/referrals' })).toMatchObject({ demo: true, view: 'referrals' });
    expect(parseLocation({ pathname: '/demo', search: '?modal=filter' })).toMatchObject({ dongleId: 'deadbeefdeadbeef', modal: 'filter' });
    expect(parseLocation({ pathname: '/demo', search: '?modal=clips' })).toMatchObject({ dongleId: 'deadbeefdeadbeef', modal: 'clips' });
  });

  it('preserves unrelated query parameters and hashes when changing pages or overlays', () => {
    const location = { pathname: `/demo/${DONGLE}/${LOG}`, search: '?utm_source=test&modal=settings&device=1111bbbb1111bbbb', hash: '#keep' };
    expect(locationWithModal(location, 'clips', { clip: 'my clip.mp4', confirm: 'delete' }))
      .toBe(`/demo/${DONGLE}/${LOG}?utm_source=test&modal=clips&clip=my+clip.mp4&confirm=delete#keep`);
    expect(locationWithModal(location, null)).toBe(`/demo/${DONGLE}/${LOG}?utm_source=test#keep`);
    expect(locationWithPath(location, '/demo/referrals')).toBe('/demo/referrals?utm_source=test#keep');
  });
});
