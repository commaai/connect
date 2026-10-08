import { describe, expect, it } from 'vitest';

import { Pages, parsePath, pathFor, withParams, withoutParams } from './url';

const DONGLE = '0000aaaa0000aaaa';
const ROUTE = '2026-08-06--12-00-00';

describe('parsePath', () => {
  it.each([
    ['/', { page: Pages.LANDING }],
    ['', { page: Pages.LANDING }],
    ['/auth', { page: Pages.LANDING }],
    ['/demo', { page: Pages.LANDING }],
    ['/referrals', { page: Pages.REFERRALS }],
    ['/referrals/', { page: Pages.REFERRALS }],
    [`/${DONGLE}`, { page: Pages.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: Pages.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: Pages.PRIME, dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: Pages.STREAM, dongleId: DONGLE }],
    [`/${DONGLE}/${ROUTE}`, { page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: null }],
    [`/${DONGLE}/${ROUTE}/10/20`, {
      page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: [10000, 20000],
    }],
    [`/${DONGLE}/${ROUTE}/0/20`, {
      page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: [0, 20000],
    }],
    [`/${DONGLE}/1772040630000/1772040690000`, {
      page: Pages.LEGACY_RANGE, dongleId: DONGLE, range: [1772040630000, 1772040690000],
    }],
  ])('parses %s', (pathname, expected) => {
    expect(parsePath(pathname)).toEqual(expected);
  });

  it('falls back to the dashboard for unknown segments', () => {
    expect(parsePath(`/${DONGLE}/prime/10`)).toEqual({ page: Pages.DASHBOARD, dongleId: DONGLE });
    expect(parsePath(`/${DONGLE}/${ROUTE}/10`)).toEqual({
      page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: null,
    });
    expect(parsePath(`/${DONGLE}/abc/10/20`)).toEqual({ page: Pages.DASHBOARD, dongleId: DONGLE });
  });
});

describe('pathFor', () => {
  it.each([
    [{ page: Pages.LANDING }, '/'],
    [{ page: Pages.REFERRALS }, '/referrals'],
    [{ page: Pages.DASHBOARD, dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: Pages.PRIME, dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: Pages.STREAM, dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE }, `/${DONGLE}/${ROUTE}`],
    [{ page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: [10000, 20000] }, `/${DONGLE}/${ROUTE}/10/20`],
    [{ page: Pages.DRIVE, dongleId: DONGLE, routeId: ROUTE, range: [0, 20000] }, `/${DONGLE}/${ROUTE}/0/20`],
    // a drive descriptor without a route id addresses the dashboard
    [{ page: Pages.DRIVE, dongleId: DONGLE }, `/${DONGLE}`],
  ])('builds %s from %j', (route, expected) => {
    expect(pathFor(route)).toBe(expected);
  });

  it('round-trips every parseable path', () => {
    const paths = [
      `/${DONGLE}`,
      `/${DONGLE}/prime`,
      `/${DONGLE}/stream`,
      `/${DONGLE}/${ROUTE}`,
      `/${DONGLE}/${ROUTE}/10/20`,
    ];
    for (const path of paths) {
      expect(pathFor(parsePath(path))).toBe(path);
    }
  });
});

describe('query parameters', () => {
  it('adds parameters and keeps existing ones', () => {
    expect(withParams(`/${DONGLE}`, { settings: 'bbbb' })).toBe(`/${DONGLE}?settings=bbbb`);
    expect(withParams(`/${DONGLE}`, { filter: null })).toBe(`/${DONGLE}?filter`);
    expect(withParams(`/${DONGLE}?filter`, { settings: 'bbbb' })).toBe(`/${DONGLE}?filter&settings=bbbb`);
    expect(withParams(`/${DONGLE}?filter`, { filter: null })).toBe(`/${DONGLE}?filter`);
  });

  it('removes parameters and keeps the rest', () => {
    expect(withoutParams(`/${DONGLE}?settings=bbbb`, 'settings')).toBe(`/${DONGLE}`);
    expect(withoutParams(`/${DONGLE}?filter&settings=bbbb`, 'filter')).toBe(`/${DONGLE}?settings=bbbb`);
    expect(withoutParams(`/${DONGLE}?filter`, 'uploads')).toBe(`/${DONGLE}?filter`);
    expect(withoutParams(`/${DONGLE}`, 'settings')).toBe(`/${DONGLE}`);
  });
});
