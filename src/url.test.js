import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parsePath, pathForRoute, settingsLocation, settingsDevice } from './url';

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

describe('canonical navigation grammar', () => {
  it.each(['prefix0000aaaa0000aaaa', '0000aaaa0000aaaaextra', 'gggg0000aaaa0000'])('rejects partial device matches: %s', (device) => {
    expect(parsePath(`/${device}`).kind).toBe('unknown');
  });
  it.each(['NaN/20', 'Infinity/20', '-1/20', '20/10', '10/10', 'hello/20'])('rejects invalid route ranges: %s', (range) => {
    expect(parsePath(`/${DONGLE}/${LOG}/${range}`).kind).toBe('unknown');
  });
  it.each(['home', 'dashboard', 'drive', 'prime', 'stream', 'referrals', 'demo', 'auth'])('identifies the %s page', (kind) => {
    const paths = { home: '/', dashboard: `/${DONGLE}`, drive: `/${DONGLE}/${LOG}`, prime: `/${DONGLE}/prime`,
      stream: `/${DONGLE}/stream`, referrals: '/referrals', demo: '/demo', auth: '/auth/' };
    expect(parsePath(paths[kind]).kind).toBe(kind);
  });
  it('round-trips a zero-start range in seconds', () => {
    const path = pathForRoute({ dongleId: DONGLE, routeId: LOG, start: 0, end: 20 });
    expect(parsePath(path)).toMatchObject({ kind: 'drive', routeId: LOG, zoom: { start: 0, end: 20000 } });
  });
  it('preserves the drive, auth/share query arguments and fragment through settings', () => {
    const initial = { pathname: `/${DONGLE}/${LOG}/0/20`, search: '?share_sig=abc&share_exp=10', hash: '#video' };
    const opened = settingsLocation(initial, DONGLE);
    expect(settingsDevice(opened)).toBe(DONGLE);
    expect(opened.pathname).toBe(initial.pathname);
    expect(settingsLocation(opened, null)).toEqual(initial);
  });
  it('rejects invalid settings IDs', () => expect(settingsDevice({ search: '?settings=invalid' })).toBeNull());
});

it.each(['0000010a--a51155e496', '00000000--0000000001'])('accepts modern and demo route IDs: %s', (routeId) => {
  expect(parsePath(`/${DONGLE}/${routeId}/0/20`)).toMatchObject({ kind: 'drive', routeId, zoom: { start: 0, end: 20000 } });
});

it('uses the synthetic device consistently for demo startup and history', () => {
  expect(getDongleID('/demo')).toBe('deadbeefdeadbeef');
});
