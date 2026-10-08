import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseLocation, routePath, dialogLocation } from './url';

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

  it('does not accept a device ID embedded in another segment', () => {
    expect(getDongleID(`/prefix${DONGLE}suffix`)).toBeNull();
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
    [`/${DONGLE}/00000000--0000000002`, '00000000--0000000002'],
    [`/${DONGLE}/prefix${LOG}`, null],
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

  it.each(['NaN/20', 'Infinity/20', '-1/20', '20/10', '10/10', '10/no', '0/20/extra'])('rejects an invalid drive range %s', (range) => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}/${range}` }).page).toBe('unknown');
    expect(getRouteZoom(`/${DONGLE}/${LOG}/${range}`)).toBeNull();
  });

  it('round trips a range starting at zero', () => {
    expect(parseLocation({ pathname: routePath(DONGLE, LOG, 0, 20) })).toMatchObject({
      page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 0, end: 20000 },
    });
  });

  it('preserves the underlying page, unrelated query parameters and hash for a dialog', () => {
    const location = { pathname: routePath(DONGLE, LOG), search: '?r=kept', hash: '#position' };
    const opened = dialogLocation(location, 'settings', DONGLE);
    expect(parseLocation(opened)).toMatchObject({ page: 'drive', dialog: 'settings', dialogDevice: DONGLE });
    expect(dialogLocation(opened, null)).toEqual(location);
  });

  it.each(['unknown', 'settings&device=invalid'])('ignores unsupported dialogs or invalid devices (%s)', (query) => {
    expect(parseLocation({ pathname: '/', search: `?dialog=${query}` }).dialog).toBeNull();
  });
});
