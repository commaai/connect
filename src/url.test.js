import { describe, expect, it } from 'vitest';

import { parseLocation, formatDevicePath, getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav } from './url';

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

describe('normalized navigation', () => {
  it.each([
    ['/', 'dashboard'], ['/referrals', 'referrals'], ['/auth/code/provider', 'auth'],
    [`/${DONGLE}`, 'dashboard'], [`/${DONGLE}/prime`, 'prime'], [`/${DONGLE}/stream`, 'stream'],
    [`/${DONGLE}/${LOG}`, 'drive'], [`/${DONGLE}/${LOG}/0/20`, 'drive'],
  ])('parses %s as %s', (pathname, page) => {
    expect(parseLocation({ pathname }).page).toBe(page);
  });

  it.each([
    `/x${DONGLE}`, `/${DONGLE}extra`, `/${DONGLE}/x${LOG}`, `/${DONGLE}/${LOG}extra`,
    `/${DONGLE}/${LOG}/NaN/20`, `/${DONGLE}/${LOG}/-1/20`, `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/0/Infinity`, `/${DONGLE}/${LOG}/0/9007199254740991`,
    `/${DONGLE}/${LOG}/10`, `/${DONGLE}/${LOG}/0/20/extra`, `/${DONGLE}/prime/extra`,
    `/${DONGLE}/unknown`, `/${DONGLE}/10/10`,
  ])('rejects malformed navigation %s without loading a device', (pathname) => {
    expect(parseLocation({ pathname })).toMatchObject({ page: 'unknown', dongleId: null, routeId: null, routeZoom: null });
  });

  it('round trips a zero-start drive range and preserves millisecond precision', () => {
    const pathname = formatDevicePath({ dongleId: DONGLE, routeId: LOG, routeZoom: { start: 0, end: 20.125 } });
    expect(pathname).toBe(`/${DONGLE}/${LOG}/0/20.125`);
    expect(parseLocation({ pathname }).routeZoom).toEqual({ start: 0, end: 20125 });
  });

  it('parses decimal milliseconds without floating-point rounding errors', () => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}/1.001/2.003` }).routeZoom).toEqual({ start: 1001, end: 2003 });
  });

  it('keeps settings for another device separate from the drive underneath', () => {
    const navigation = parseLocation({ pathname: `/${DONGLE}/${LOG}/10/20`, search: '?dialog=settings&settingsDevice=1111bbbb1111bbbb' });
    expect(navigation).toMatchObject({ dongleId: DONGLE, routeId: LOG, dialog: 'settings', settingsDongleId: '1111bbbb1111bbbb' });
  });

  it.each(['settings', 'unpair', 'uploads', 'pair', 'date-range', 'account'])('parses %s on a dashboard', (dialog) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: `?dialog=${dialog}` }).dialog).toBe(dialog);
  });

  it.each(['cancel-subscription', 'change-plan'])('requires Prime for %s', (dialog) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: `?dialog=${dialog}` }).dialog).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}/prime`, search: `?dialog=${dialog}` }).dialog).toBe(dialog);
  });

  it.each(['downloads', 'info', 'clips'])('requires a drive for %s', (dialog) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: `?dialog=${dialog}` }).dialog).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}`, search: `?dialog=${dialog}` }).dialog).toBe(dialog);
  });

  it('ignores unknown dialogs and invalid settings targets', () => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=unknown' }).dialog).toBeNull();
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=settings&settingsDevice=invalid' }).settingsDongleId).toBeNull();
    expect(parseLocation({ pathname: '/auth/', search: '?dialog=pair' }).dialog).toBeNull();
  });
});
