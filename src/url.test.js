import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseUrl, parseFilter, getDialog, dialogUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL grammar', () => {
  test.each([
    [`/${DONGLE}/${LOG}/0/20`, '?dialog=uploads', 'uploads'],
    [`/${DONGLE}/prime`, '?dialog=switch-plan', 'switch-plan'],
    [`/${DONGLE}/prime`, '?dialog=cancel-prime', 'cancel-prime'],
    [`/${DONGLE}/settings`, '?dialog=unpair', 'unpair'],
    [`/${DONGLE}/prime`, '?dialog=unpair', null],
    [`/${DONGLE}/settings`, '?dialog=uploads', null],
    [`/${DONGLE}/prime`, '?dialog=switch-plan&dialog=cancel-prime', null],
    [`/${DONGLE}/prime`, '?dialog=constructor', null],
  ])('accepts only an unambiguous dialog on its owning page', (pathname, search, expected) => {
    expect(getDialog({ pathname, search })).toBe(expected);
  });

  test('dialog links preserve the underlying path, unrelated query, and hash', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/5.125/20.25`, search: '?from=1000&to=9000&x=hello%20world', hash: '#position' };
    expect(dialogUrl(location, 'uploads')).toBe(`/${DONGLE}/${LOG}/5.125/20.25?from=1000&to=9000&x=hello+world&dialog=uploads#position`);
    expect(dialogUrl({ ...location, search: `${location.search}&dialog=uploads` }, null)).toBe(`/${DONGLE}/${LOG}/5.125/20.25?from=1000&to=9000&x=hello+world#position`);
  });

  test.each([
    ['?from=0&to=9000', { start: 0, end: 9000 }],
    ['?from=2000&to=9000&other=value', { start: 2000, end: 9000 }],
    ['?from=2000', null],
    ['?from=&to=9000', null],
    ['?from=9000&to=2000', null],
    ['?from=2000&to=2000', null],
    ['?from=1000&from=2000&to=9000', null],
    ['?from=-1&to=9000', null],
    ['?from=1.5&to=9000', null],
    ['?from=1000&to=8640000000000001', null],
  ])('validates date-filter boundaries in %s', (search, expected) => {
    expect(parseFilter(search)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', legacyRange: { start: 1000, end: 2000 } }],
    [`/prefix${DONGLE}/prime`, { page: 'notFound', dongleId: null }],
    [`/${DONGLE}/prime/extra`, { page: 'notFound', dongleId: null }],
    [`/${DONGLE}/${LOG}/NaN/20`, { page: 'notFound', dongleId: null }],
    [`/${DONGLE}/${LOG}/20/10`, { page: 'notFound', dongleId: null }],
  ])('parses %s without accepting partial matches or invalid ranges', (pathname, expected) => {
    expect(parseUrl(pathname)).toMatchObject(expected);
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
