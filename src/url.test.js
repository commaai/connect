import { describe, expect, it } from 'vitest';

import { formatUrl, Pages, parseLocation, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', Pages.DASHBOARD, null],
    [`/${DONGLE}`, Pages.DASHBOARD, DONGLE],
    [`/${DONGLE}/${LOG}`, Pages.DRIVE, DONGLE],
    [`/${DONGLE}/${LOG}/10/20`, Pages.DRIVE, DONGLE],
    [`/${DONGLE}/prime`, Pages.PRIME, DONGLE],
    [`/${DONGLE}/stream`, Pages.STREAM, DONGLE],
    ['/referrals', Pages.REFERRALS, null],
    ['/auth/code/provider', Pages.DASHBOARD, null],
    ['/prime', Pages.DASHBOARD, null],
  ])('parseUrl(%s) is the %s page', (pathname, page, dongleId) => {
    const url = parseUrl(pathname);
    expect(url.page).toBe(page);
    expect(url.dongleId).toBe(dongleId);
  });

  it('reads the drive log id and range', () => {
    expect(parseUrl(`/${DONGLE}/${LOG}`)).toMatchObject({ routeId: LOG, zoom: null });
    expect(parseUrl(`/${DONGLE}/${LOG}/556/610`)).toMatchObject({
      routeId: LOG,
      zoom: { start: 556000, end: 610000 },
    });
    expect(parseUrl(`/${DONGLE}/${LOG}/0/20`)).toMatchObject({
      zoom: { start: 0, end: 20000 },
    });
  });

  it('reads legacy timestamp ranges as seconds', () => {
    expect(parseUrl(`/${DONGLE}/1000/2000`)).toMatchObject({
      timeRange: { start: 1000, end: 2000 },
    });
    expect(parseUrl(`/${DONGLE}/10`)).toMatchObject({ timeRange: null });
  });

  it('does not confuse keywords with routes or ranges', () => {
    expect(parseUrl(`/${DONGLE}/prime/extra`)).toMatchObject({ page: Pages.PRIME, routeId: null, timeRange: null });
    expect(parseUrl(`/${DONGLE}/stream/extra`)).toMatchObject({ page: Pages.STREAM, routeId: null, timeRange: null });
    expect(parseUrl(`/${DONGLE}/prime`)).toMatchObject({ timeRange: null });
  });

  it('reads the settings modal from the query string', () => {
    expect(parseUrl(`/${DONGLE}`, `?settings=${OTHER}`).settingsDongleId).toBe(OTHER);
    expect(parseUrl(`/${DONGLE}/${LOG}/10/20`, `?settings=${OTHER}`)).toMatchObject({
      page: Pages.DRIVE,
      settingsDongleId: OTHER,
    });
    expect(parseUrl(`/${DONGLE}`).settingsDongleId).toBeNull();
    expect(parseUrl(`/${DONGLE}`, '?settings=not-a-device').settingsDongleId).toBeNull();
  });
});

describe('formatUrl', () => {
  it.each([
    [{}, '/'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, page: Pages.PRIME }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: Pages.STREAM }, `/${DONGLE}/stream`],
    [{ page: Pages.REFERRALS }, '/referrals'],
    [{ dongleId: DONGLE, settingsDongleId: OTHER }, `/${DONGLE}?settings=${OTHER}`],
  ])('formatUrl(%j)', (url, expected) => {
    expect(formatUrl(url)).toBe(expected);
  });

  it('round trips every shape through parseUrl', () => {
    const shapes = [
      { dongleId: DONGLE },
      { dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG },
      { dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG, zoom: { start: 0, end: 20000 } },
      // URLs carry whole seconds, so only second-aligned ranges survive exactly
      { dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG, zoom: { start: 4000, end: 98000 } },
      { dongleId: DONGLE, page: Pages.PRIME },
      { dongleId: DONGLE, page: Pages.STREAM },
      { page: Pages.REFERRALS },
      { dongleId: DONGLE, settingsDongleId: OTHER },
      { dongleId: DONGLE, page: Pages.DRIVE, routeId: LOG, settingsDongleId: OTHER },
    ];
    for (const url of shapes) {
      const [path, query = ''] = formatUrl(url).split('?');
      expect(parseUrl(path, query ? `?${query}` : '')).toMatchObject({
        page: url.page ?? Pages.DASHBOARD,
        dongleId: url.dongleId ?? null,
        routeId: url.routeId ?? null,
        zoom: url.zoom ?? null,
        settingsDongleId: url.settingsDongleId ?? null,
      });
    }
  });
});

describe('parseLocation', () => {
  it('parses a router location and memoizes it by identity', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/10/20`, search: '' };
    const first = parseLocation(location);
    expect(first).toMatchObject({ page: Pages.DRIVE, routeId: LOG, zoom: { start: 10000, end: 20000 } });
    expect(parseLocation(location)).toBe(first);

    const next = { pathname: `/${DONGLE}`, search: `?settings=${OTHER}` };
    expect(parseLocation(next)).toMatchObject({ settingsDongleId: OTHER });
    expect(parseLocation(next)).not.toBe(first);
  });
});
