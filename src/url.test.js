import { describe, expect, it } from 'vitest';

import { parseLocation, buildUrl, withQuery } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const loc = (pathname, search = '') => ({ pathname, search });

describe('parseLocation', () => {
  it.each([
    ['/', { page: 'dashboard', dongleId: null, routeId: null, zoom: null, legacy: null }],
    ['/demo', { page: 'dashboard', dongleId: null, routeId: null, zoom: null, legacy: null }],
    ['/referrals', { page: 'referrals', dongleId: null, routeId: null, zoom: null, legacy: null }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE, routeId: null, zoom: null, legacy: null }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE, routeId: null, zoom: null, legacy: null }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE, routeId: null, zoom: null, legacy: null }],
    [`/${DONGLE}/${LOG}`, {
      page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: null, legacy: null,
    }],
    [`/${DONGLE}/${LOG}/556/610`, {
      page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 }, legacy: null,
    }],
    [`/${DONGLE}/${LOG}/0/20`, {
      page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 }, legacy: null,
    }],
    [`/${DONGLE}/1000/2000`, {
      page: 'dashboard', dongleId: DONGLE, routeId: null, zoom: null, legacy: { start: 1000, end: 2000 },
    }],
  ])('parses %s', (pathname, expected) => {
    expect(parseLocation(loc(pathname))).toMatchObject(expected);
  });

  it.each([
    ['/auth/code/provider'],
    ['/not-a-device'],
    ['/not-a-device/prime'],
    ['/referrals/extra'],
  ])('treats %s as unknown (state untouched)', (pathname) => {
    expect(parseLocation(loc(pathname)).page).toBe('unknown');
  });

  it.each([
    [`/${DONGLE}/prime/extra`],
    [`/${DONGLE}/stream/extra`],
    [`/${DONGLE}/nonsense`],
  ])('falls back to the device dashboard for %s', (pathname) => {
    const nav = parseLocation(loc(pathname));
    expect(nav.page).toBe('dashboard');
    expect(nav.dongleId).toBe(DONGLE);
    expect(nav.routeId).toBeNull();
  });

  it.each([
    [`/${DONGLE}/${LOG}/bogus`],
    [`/${DONGLE}/${LOG}/10`],
    [`/${DONGLE}/${LOG}/10/20/extra`],
  ])('falls back to the drive without zoom for %s', (pathname) => {
    const nav = parseLocation(loc(pathname));
    expect(nav.page).toBe('drive');
    expect(nav.dongleId).toBe(DONGLE);
    expect(nav.routeId).toBe(LOG);
    expect(nav.zoom).toBeNull();
  });

  it.each([
    [`/${DONGLE}/${LOG}/NaN/20`],
    [`/${DONGLE}/${LOG}/10/NaN`],
    [`/${DONGLE}/NaN/20`],
  ])('handles non-numeric ranges gracefully for %s', (pathname) => {
    const nav = parseLocation(loc(pathname));
    expect(nav.zoom).toBeNull();
    expect(nav.legacy).toBeNull();
  });

  it('parses query params', () => {
    const nav = parseLocation(loc(`/${DONGLE}`, `?settings=${OTHER}&pair=tok123`));
    expect(nav.settings).toBe(OTHER);
    expect(nav.pair).toBe('tok123');
    expect(nav.page).toBe('dashboard');
  });

  it('never throws on garbage input', () => {
    expect(() => parseLocation(undefined)).not.toThrow();
    expect(() => parseLocation({})).not.toThrow();
    expect(() => parseLocation(loc('///'))).not.toThrow();
  });
});

describe('buildUrl', () => {
  it.each([
    [{ page: 'dashboard' }, '/'],
    [{ page: 'dashboard', dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'referrals' }, '/referrals'],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 } },
      `/${DONGLE}/${LOG}/556/610`],
    // a range starting at 0 is serialized explicitly (not dropped)
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 30000 } },
      `/${DONGLE}/${LOG}/0/30`],
    // whole-drive zooms serialize without a range, matching historical URLs
    [{ page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 60000 } },
      `/${DONGLE}/${LOG}`, { routeDuration: 60000 }],
    [{ page: 'dashboard', dongleId: DONGLE, settings: OTHER }, `/${DONGLE}?settings=${OTHER}`],
  ])('builds %s', (nav, expected, opts) => {
    expect(buildUrl(nav, opts)).toBe(expected);
  });
});

describe('parseLocation/buildUrl round trips', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/${LOG}/0/30`,
    `/${DONGLE}?settings=${OTHER}`,
    `/${DONGLE}/${LOG}/10/20?settings=${OTHER}`,
  ])('round-trips %s', (url) => {
    const [pathname, search] = url.split('?');
    const nav = parseLocation(loc(pathname, search ? `?${search}` : ''));
    expect(buildUrl(nav)).toBe(url);
  });
});

describe('withQuery', () => {
  it('adds a param', () => {
    expect(withQuery(loc(`/${DONGLE}`), { settings: OTHER })).toBe(`/${DONGLE}?settings=${OTHER}`);
  });

  it('removes a param', () => {
    expect(withQuery(loc(`/${DONGLE}`, `?settings=${OTHER}`), { settings: null })).toBe(`/${DONGLE}`);
  });

  it('preserves other params', () => {
    expect(withQuery(loc(`/${DONGLE}`, '?pair=tok'), { settings: OTHER }))
      .toBe(`/${DONGLE}?pair=tok&settings=${OTHER}`);
  });
});
