import { describe, expect, it } from 'vitest';

import { parseUrl, buildUrl, ROUTES } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const NONE = { page: null, dongleId: null, routeId: null, zoom: null };
const dashboard = (dongleId = DONGLE) => ({
  page: ROUTES.DASHBOARD, dongleId, routeId: null, zoom: null,
});

describe('parseUrl', () => {
  it('reads the empty path as no destination', () => {
    expect(parseUrl('/')).toEqual(NONE);
  });

  it('parses dashboard route', () => {
    expect(parseUrl(`/${DONGLE}`)).toEqual(dashboard());
    expect(parseUrl(`/${DONGLE}/`)).toEqual(dashboard());
  });

  it('parses settings route', () => {
    expect(parseUrl(`/${DONGLE}/settings`)).toEqual({ ...dashboard(), page: ROUTES.SETTINGS });
  });

  it('parses prime route', () => {
    expect(parseUrl(`/${DONGLE}/prime`)).toEqual({ ...dashboard(), page: ROUTES.PRIME });
  });

  it('parses stream route', () => {
    expect(parseUrl(`/${DONGLE}/stream`)).toEqual({ ...dashboard(), page: ROUTES.STREAM });
  });

  it('parses drive route without zoom', () => {
    expect(parseUrl(`/${DONGLE}/${LOG}`)).toEqual({ ...dashboard(), page: ROUTES.DRIVE, routeId: LOG });
  });

  it('parses drive route with zoom', () => {
    expect(parseUrl(`/${DONGLE}/${LOG}/10/20`)).toEqual({
      ...dashboard(), page: ROUTES.DRIVE, routeId: LOG, zoom: { start: 10000, end: 20000 },
    });
    expect(parseUrl(`/${DONGLE}/${LOG}/0/20`).zoom).toEqual({ start: 0, end: 20000 });
    expect(parseUrl(`/${DONGLE}/${LOG}/556/610`).zoom).toEqual({ start: 556000, end: 610000 });
  });

  it('parses legacy range route', () => {
    expect(parseUrl(`/${DONGLE}/1000/2000`)).toEqual({
      ...dashboard(), page: ROUTES.LEGACY, zoom: { start: 1000, end: 2000 },
    });
    expect(parseUrl(`/${DONGLE}/0/20`).page).toBe(ROUTES.LEGACY);
  });

  it('parses referrals route', () => {
    expect(parseUrl('/referrals')).toEqual({ ...NONE, page: ROUTES.REFERRALS });
  });

  it.each([
    ['a dongle id with a valid prefix and junk after it', `/${DONGLE}zzz`],
    ['a dongle id with junk in front of it', `zzz${DONGLE}`],
    ['an upper case dongle id', `/${DONGLE.toUpperCase()}`],
    ['a device name instead of a dongle id', '/settings'],
    ['an auth path', '/auth/code/provider'],
  ])('reads %s as no destination at all', (_name, pathname) => {
    expect(parseUrl(pathname)).toEqual(NONE);
  });

  it.each([
    ['a keyword page with trailing junk', `/${DONGLE}/prime/extra`],
    ['a settings page with trailing junk', `/${DONGLE}/settings/extra`],
    ['a stream page with trailing junk', `/${DONGLE}/stream/extra`],
    ['an unknown page', `/${DONGLE}/unknownpage`],
    ['a log id with junk after it', `/${DONGLE}/${LOG}z`],
    ['a range that is not a pair', `/${DONGLE}/10`],
  ])('falls back to the dashboard for %s', (_name, pathname) => {
    expect(parseUrl(pathname)).toEqual(dashboard());
  });

  it('never yields a NaN range', () => {
    expect(parseUrl(`/${DONGLE}/abc/def`)).toEqual(dashboard());
    expect(parseUrl(`/${DONGLE}/${LOG}/abc/def`).zoom).toBeNull();
    expect(parseUrl(`/${DONGLE}/${LOG}/abc/def`).routeId).toBe(LOG);
  });

  it.each([null, undefined, 0, ['x'], {}])('rejects a non-pathname %j', (pathname) => {
    expect(parseUrl(pathname)).toEqual(NONE);
  });
});

describe('buildUrl', () => {
  it('builds dashboard url', () => {
    expect(buildUrl({ page: ROUTES.DASHBOARD, dongleId: DONGLE })).toBe(`/${DONGLE}`);
    expect(buildUrl({ dongleId: DONGLE })).toBe(`/${DONGLE}`);
  });

  it('builds settings url', () => {
    expect(buildUrl({ page: ROUTES.SETTINGS, dongleId: DONGLE })).toBe(`/${DONGLE}/settings`);
  });

  it('builds prime url', () => {
    expect(buildUrl({ page: ROUTES.PRIME, dongleId: DONGLE })).toBe(`/${DONGLE}/prime`);
  });

  it('builds stream url', () => {
    expect(buildUrl({ page: ROUTES.STREAM, dongleId: DONGLE })).toBe(`/${DONGLE}/stream`);
  });

  it('builds drive url with and without zoom', () => {
    expect(buildUrl({ page: ROUTES.DRIVE, dongleId: DONGLE, routeId: LOG })).toBe(`/${DONGLE}/${LOG}`);
    expect(buildUrl({
      page: ROUTES.DRIVE,
      dongleId: DONGLE,
      routeId: LOG,
      zoom: { start: 10000, end: 20000 },
    })).toBe(`/${DONGLE}/${LOG}/10/20`);
  });

  it('keeps a range that starts at second zero', () => {
    expect(buildUrl({
      page: ROUTES.DRIVE,
      dongleId: DONGLE,
      routeId: LOG,
      zoom: { start: 0, end: 20000 },
    })).toBe(`/${DONGLE}/${LOG}/0/20`);
  });

  it('builds legacy url', () => {
    expect(buildUrl({
      page: ROUTES.LEGACY,
      dongleId: DONGLE,
      zoom: { start: 1786017600000, end: 1786017660000 },
    })).toBe(`/${DONGLE}/1786017600000/1786017660000`);
  });

  it('builds referrals url', () => {
    expect(buildUrl({ page: ROUTES.REFERRALS })).toBe('/referrals');
  });

  it('has nowhere to go without a dongle id', () => {
    expect(buildUrl()).toBe('/');
    expect(buildUrl({ page: ROUTES.DRIVE, routeId: LOG })).toBe('/');
  });
});

it.each([
  '/referrals',
  `/${DONGLE}`,
  `/${DONGLE}/settings`,
  `/${DONGLE}/prime`,
  `/${DONGLE}/stream`,
  `/${DONGLE}/${LOG}`,
  `/${DONGLE}/${LOG}/10/20`,
  `/${DONGLE}/${LOG}/0/20`,
  `/${DONGLE}/1786017600000/1786017660000`,
])('buildUrl is the inverse of parseUrl for %s', (pathname) => {
  const destination = parseUrl(pathname);
  expect(buildUrl(destination)).toBe(pathname);
  expect(parseUrl(buildUrl(destination))).toEqual(destination);
});
