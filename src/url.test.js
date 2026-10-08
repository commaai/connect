import { describe, expect, it } from 'vitest';

import {
  deviceUrl, driveUrl, editUrl, getDongleID, getRouteId, parseUrl, primeUrl, streamUrl, visibleSettings, withFilter,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/demo', { page: 'demo' }],
    ['/referrals', { page: 'referrals' }],
    ['/auth/google', { page: 'auth' }],
    ['/not-a-device', { page: 'unknown' }],
    [`/${DONGLE}`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: 'unknown', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/10/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, legacy: { start: 1000, end: 2000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toMatchObject(expected);
  });

  it('reads overlays and drops a settings id that is not a dongle', () => {
    const view = parseUrl(`/${DONGLE}/${LOG}`, `?settings=${OTHER}&uploads=1&add=1&filter=1&from=5&to=9&pair=abc&r=/x`);
    expect(view).toMatchObject({
      page: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      settings: OTHER,
      uploads: true,
      add: true,
      filterOpen: true,
      filter: { start: 5, end: 9 },
    });
    expect(parseUrl('/', '?settings=nope&uploads=true&from=5').settings).toBeNull();
    expect(parseUrl('/', '?from=5').filter).toBeNull();
  });

  it('keeps the dongle and log helpers', () => {
    expect(getDongleID(`/${DONGLE}/${LOG}`)).toBe(DONGLE);
    expect(getDongleID('/')).toBeNull();
    expect(getRouteId(`/${DONGLE}/${LOG}/10/20`)).toBe(LOG);
    expect(getRouteId(`/${DONGLE}/prime`)).toBeNull();
  });
});

describe('url builders', () => {
  it('builds each page', () => {
    expect(deviceUrl(DONGLE)).toBe(`/${DONGLE}`);
    expect(primeUrl(DONGLE)).toBe(`/${DONGLE}/prime`);
    expect(streamUrl(DONGLE)).toBe(`/${DONGLE}/stream`);
  });

  it.each([
    ['whole drive', null, `/${DONGLE}/${LOG}`],
    ['zero-length range', { start: 1000, end: 1000 }, `/${DONGLE}/${LOG}`],
    ['zero start', { start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
    ['sub-second start', { start: 123, end: 1234 }, `/${DONGLE}/${LOG}/0/2`],
    ['whole seconds', { start: 10000, end: 20000 }, `/${DONGLE}/${LOG}/10/20`],
  ])('driveUrl %s', (_name, range, expected) => {
    expect(driveUrl(DONGLE, LOG, range)).toBe(expected);
  });

  it('carries a custom range and nothing else onto the next path', () => {
    const location = { search: '?from=5&to=9&settings=1&uploads=1&pair=abc' };
    expect(withFilter(location, `/${DONGLE}/${LOG}`)).toBe(`/${DONGLE}/${LOG}?from=5&to=9`);
    expect(withFilter({ search: '' }, `/${DONGLE}`)).toBe(`/${DONGLE}`);
    expect(withFilter(null, '/referrals')).toBe('/referrals');
  });

  it('edits query keys and deletes with null', () => {
    expect(editUrl(`/${DONGLE}`, '?pair=abc', { settings: OTHER, filter: '1' }))
      .toBe(`/${DONGLE}?pair=abc&settings=${OTHER}&filter=1`);
    expect(editUrl(`/${DONGLE}`, '?settings=x&uploads=1&filter=1', { settings: null, uploads: null, filter: null }))
      .toBe(`/${DONGLE}`);
  });
});

describe('visibleSettings', () => {
  const owner = { dongle_id: DONGLE, is_owner: true };
  const shared = { dongle_id: OTHER, is_owner: false, shared: true };

  it('opens for an owner or a superuser, including a device that is not selected', () => {
    const state = { devices: [owner, shared], device: owner, profile: { superuser: false } };
    expect(visibleSettings({ settings: DONGLE }, state)).toBe(owner);
    expect(visibleSettings({ settings: OTHER }, state)).toBeNull();
    expect(visibleSettings({ settings: OTHER }, { ...state, profile: { superuser: true } })).toBe(shared);
    expect(visibleSettings({ settings: null }, state)).toBeNull();
  });
});
