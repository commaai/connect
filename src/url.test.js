import { describe, expect, it } from 'vitest';
import { parsePath, urlForRoute, devicePath, drivePath } from './url';
import { DEMO_DONGLE_ID } from './api/demo';

const DEVICE = '0000aaaa0000aaaa';
const ROUTE = '2026-08-06--12-00-00';

describe('the URL grammar', () => {
  it.each([
    ['/', 'home', null, null],
    ['/referrals', 'referrals', null, null],
    ['/add-device', 'add-device', null, null],
    ['/demo', 'drives', DEMO_DONGLE_ID, null],
    [`/${DEVICE}`, 'drives', DEVICE, null],
    [`/${DEVICE}/prime`, 'prime', DEVICE, null],
    [`/${DEVICE}/stream`, 'stream', DEVICE, null],
    [`/${DEVICE}/settings`, 'settings', DEVICE, null],
    [`/${DEVICE}/filter`, 'filter', DEVICE, null],
    [`/${DEVICE}/add-device`, 'add-device', DEVICE, null],
    [`/${DEVICE}/uploads`, 'uploads', DEVICE, null],
    [`/${DEVICE}/${ROUTE}`, 'drive', DEVICE, ROUTE],
    [`/${DEVICE}/${ROUTE}/clips`, 'clips', DEVICE, ROUTE],
    [`/${DEVICE}/${ROUTE}/uploads`, 'uploads', DEVICE, ROUTE],
  ])('reads %s as %s', (path, page, dongleId, routeId) => {
    expect(parsePath(path)).toMatchObject({ page, dongleId, routeId });
  });

  it('reads exact route ranges, including zero, and clips within a range', () => {
    expect(parsePath(`/${DEVICE}/${ROUTE}/0/20`)).toMatchObject({
      page: 'drive', range: { start: 0, end: 20000 },
    });
    expect(parsePath(`/${DEVICE}/${ROUTE}/10/20/clips`)).toMatchObject({
      page: 'clips', range: { start: 10000, end: 20000 },
    });
    expect(parsePath(`/${DEVICE}/${ROUTE}/10/20/uploads`)).toMatchObject({
      page: 'uploads', range: { start: 10000, end: 20000 },
    });
    expect(parsePath(`/${DEVICE}/1000/2000`)).toMatchObject({
      page: 'legacy-range', range: { start: 1000, end: 2000 },
    });
  });

  it.each([
    '/auth/code/provider',
    `/prefix${DEVICE}/settings`,
    `/${DEVICE}/prime/extra`,
    `/${DEVICE}/${ROUTE}/20/10`,
    `/${DEVICE}/${ROUTE}/NaN/20`,
    `/${DEVICE}/${ROUTE}/1e6/20`,
    `/${DEVICE}/${ROUTE}/0/9007199254740992`,
  ])('rejects malformed or partial match %s', (path) => {
    expect(parsePath(path)).toMatchObject({ page: 'unknown', dongleId: null });
  });

  it('formats device and drive URLs', () => {
    expect(devicePath(DEVICE, 'settings')).toBe(`/${DEVICE}/settings`);
    expect(drivePath(DEVICE, ROUTE, 0, 20000)).toBe(`/${DEVICE}/${ROUTE}/0/20`);
    expect(drivePath(DEVICE, ROUTE, 1001, 20001)).toBe(`/${DEVICE}/${ROUTE}/1/21`);
    expect(drivePath(DEVICE, ROUTE)).toBe(`/${DEVICE}/${ROUTE}`);
  });

  it.each([
    '/', '/referrals', '/add-device', `/${DEVICE}`, `/${DEVICE}/settings`,
    `/${DEVICE}/add-device`, `/${DEVICE}/filter`, `/${DEVICE}/uploads`,
    `/${DEVICE}/prime`, `/${DEVICE}/stream`, `/${DEVICE}/${ROUTE}`,
    `/${DEVICE}/${ROUTE}/clips`, `/${DEVICE}/${ROUTE}/uploads`,
    `/${DEVICE}/${ROUTE}/10/20`, `/${DEVICE}/${ROUTE}/10/20/clips`,
    `/${DEVICE}/${ROUTE}/10/20/uploads`,
  ])('round-trips the canonical route %s', (path) => {
    expect(urlForRoute(parsePath(path))).toBe(path);
  });
});
