import { describe, expect, it } from 'vitest';

import { parseLocation, buildPath, Pages } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const empty = { dongleId: null, routeId: null, zoom: null, range: null };

describe('parseLocation', () => {
  it.each([
    ['/', { ...empty, page: Pages.HOME }],
    ['/referrals', { ...empty, page: Pages.REFERRALS }],
    ['/referrals/extra', { ...empty, page: Pages.UNKNOWN }],
    ['/auth/', { ...empty, page: Pages.AUTH }],
    ['/auth/code/provider', { ...empty, page: Pages.AUTH }],
    ['/prime', { ...empty, page: Pages.UNKNOWN }],
    ['/not-a-device/prime', { ...empty, page: Pages.UNKNOWN }],
    [`/${DONGLE}`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
    [`/${DONGLE}/`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { ...empty, page: Pages.PRIME, dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { ...empty, page: Pages.STREAM, dongleId: DONGLE }],
    [`/${DONGLE}/stream/extra`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { ...empty, page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, {
      ...empty, page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 },
    }],
    [`/${DONGLE}/${LOG}/0/20`, {
      ...empty, page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 },
    }],
    [`/${DONGLE}/${LOG}/10`, { ...empty, page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/a/b`, { ...empty, page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/10/20`, { ...empty, page: Pages.RANGE, dongleId: DONGLE, range: { start: 10, end: 20 } }],
    [`/${DONGLE}/0/20/ignored`, { ...empty, page: Pages.RANGE, dongleId: DONGLE, range: { start: 0, end: 20 } }],
    [`/${DONGLE}/10`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
    [`/${DONGLE}/something-else`, { ...empty, page: Pages.DEVICE, dongleId: DONGLE }],
  ])('parses %s', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual(expected);
  });

  it('requires a whole 16 character dongle id', () => {
    expect(parseLocation(`/${DONGLE}0`).dongleId).toBeNull();
    expect(parseLocation(`/x${DONGLE}`).dongleId).toBeNull();
  });
});

describe('buildPath', () => {
  it.each([
    ['home', {}, '/'],
    ['referrals', { page: Pages.REFERRALS }, '/referrals'],
    ['device', { page: Pages.DEVICE, dongleId: DONGLE }, `/${DONGLE}`],
    ['prime', { page: Pages.PRIME, dongleId: DONGLE }, `/${DONGLE}/prime`],
    ['stream', { page: Pages.STREAM, dongleId: DONGLE }, `/${DONGLE}/stream`],
    ['route', { page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    ['zoomed route', {
      page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 },
    }, `/${DONGLE}/${LOG}/10/20`],
    ['route zoomed from the start', {
      page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 },
    }, `/${DONGLE}/${LOG}/0/20`],
    ['zoom rounded down to whole seconds', {
      page: Pages.ROUTE, dongleId: DONGLE, routeId: LOG, zoom: { start: 10999, end: 20999 },
    }, `/${DONGLE}/${LOG}/10/20`],
  ])('builds the %s path', (_name, location, expected) => {
    expect(buildPath(location)).toBe(expected);
  });

  it.each([
    `/`,
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/${LOG}/0/20`,
  ])('round-trips %s', (pathname) => {
    expect(buildPath(parseLocation(pathname))).toBe(pathname);
  });
});
