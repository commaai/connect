import { describe, expect, it } from 'vitest';

import { parseLocation, pathFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const nav = (fields) => ({
  page: 'dashboard', dongleId: null, routeId: null, zoom: null, legacyZoom: null, settings: null, ...fields,
});

describe('parseLocation', () => {
  it.each([
    ['/', nav({})],
    ['/demo', nav({})],
    ['/auth/code/provider', nav({})],
    ['/referrals', nav({ page: 'referrals' })],
    [`/${DONGLE}`, nav({ dongleId: DONGLE })],
    [`/${DONGLE}/`, nav({ dongleId: DONGLE })],
    [`/${DONGLE}/prime`, nav({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, nav({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${LOG}/10`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/${LOG}/a/b`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/${LOG}/20/10`, nav({ page: 'drive', dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/1000/2000`, nav({ dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/10`, nav({ dongleId: DONGLE })],
    ['/not-a-device/prime', nav({})],
    [`/${DONGLE}x`, nav({})],
  ])('%s', (pathname, expected) => {
    expect(parseLocation({ pathname })).toEqual(expected);
  });

  it.each([
    [`?settings=${OTHER}`, OTHER],
    [`?stripe_success=1&settings=${OTHER}`, OTHER],
    ['?settings=nope', null],
    ['', null],
  ])('reads the settings dialog from %j', (search, settings) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search }).settings).toBe(settings);
  });
});

describe('pathFor', () => {
  it.each([
    [{}, '/'],
    [{ page: 'referrals', dongleId: DONGLE }, '/referrals'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 10500, end: 20900 } }, `/${DONGLE}/${LOG}/10/21`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 12300, end: 12900 } }, `/${DONGLE}/${LOG}/12/13`],
    [{ page: 'drive', dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, settings: OTHER }, `/${DONGLE}?settings=${OTHER}`],
  ])('%j', (target, expected) => {
    expect(pathFor(target)).toBe(expected);
  });

  it.each([
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(pathFor(parseLocation({ pathname }))).toBe(pathname);
  });
});
