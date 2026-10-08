import { describe, expect, it } from 'vitest';

import { pagePath, parseLocation, selectPage } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function locationOf(path) {
  const [pathname, search = ''] = path.split('?');
  return { pathname, search: search ? `?${search}` : '' };
}

describe('URL pages', () => {
  it.each([
    ['/', { kind: 'home', dongleId: null, settings: null }],
    ['/referrals', { kind: 'referrals', dongleId: null, settings: null }],
    [`/${DONGLE}`, { kind: 'device', dongleId: DONGLE, settings: null }],
    [`/${DONGLE}/prime`, { kind: 'prime', dongleId: DONGLE, settings: null }],
    [`/${DONGLE}/stream`, { kind: 'stream', dongleId: DONGLE, settings: null }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: null, settings: null }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 }, settings: null }],
    [`/${DONGLE}/${LOG}/0/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 }, settings: null }],
    [`/${DONGLE}?settings`, { kind: 'device', dongleId: DONGLE, settings: DONGLE }],
    [`/${DONGLE}/${LOG}?settings=${OTHER}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: null, settings: OTHER }],
    [`/referrals?settings=${OTHER}`, { kind: 'referrals', dongleId: null, settings: OTHER }],
  ])('round trips %s', (path, page) => {
    expect(pagePath(page)).toBe(path);
    expect(parseLocation(locationOf(path))).toEqual(page);
  });

  it.each([
    [`/${DONGLE}/1690488081496/1690488851596`, { kind: 'legacyRange', dongleId: DONGLE, start: 1690488081496, end: 1690488851596, settings: null }],
    [`/${DONGLE}/`, { kind: 'device', dongleId: DONGLE, settings: null }],
    ['/auth/', { kind: 'home', dongleId: null, settings: null }],
    ['/demo', { kind: 'home', dongleId: null, settings: null }],
    ['/not-a-device/prime', { kind: 'home', dongleId: null, settings: null }],
    [`/${DONGLE}/prime/extra`, { kind: 'device', dongleId: DONGLE, settings: null }],
    [`/${DONGLE}/${LOG}/10`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: null, settings: null }],
    [`/${DONGLE}/${LOG}/10/20/extra`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 }, settings: null }],
    [`/${DONGLE}/${LOG}x`, { kind: 'device', dongleId: DONGLE, settings: null }],
    [`/${DONGLE}?settings=nope`, { kind: 'device', dongleId: DONGLE, settings: null }],
    ['/?settings', { kind: 'home', dongleId: null, settings: null }],
  ])('parses %s', (path, page) => {
    expect(parseLocation(locationOf(path))).toEqual(page);
  });

  it('keeps stripe keys only on prime', () => {
    const search = '?stripe_success=sess_1&pair=token&r=/x';
    expect(pagePath({ kind: 'prime', dongleId: DONGLE, settings: DONGLE }, search)).toBe(`/${DONGLE}/prime?stripe_success=sess_1&settings`);
    expect(pagePath({ kind: 'device', dongleId: DONGLE, settings: null }, search)).toBe(`/${DONGLE}`);
  });

  it.each(['legacyRange', 'settings'])('refuses to format kind %s', (kind) => {
    expect(() => pagePath({ kind, dongleId: DONGLE, settings: null })).toThrow(kind);
  });

  it('caches the page on the location object', () => {
    const location = locationOf(`/${DONGLE}`);
    const page = selectPage({ router: { location } });
    expect(selectPage({ router: { location } })).toBe(page);
    expect(selectPage({ router: { location: { ...location } } })).not.toBe(page);
  });
});
