import { describe, expect, it } from 'vitest';

import { buildUrl, parseUrl, sameOriginPath } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OVERFLOW_SECONDS = `1${'0'.repeat(306)}`;

describe('URL parsing and building', () => {
  it.each([
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE, routeId: null }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } }],
    ['/demo?modal=filter', { page: 'demo', dongleId: 'deadbeefdeadbeef', modal: 'filter' }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    ['/referrals?modal=pair', { page: 'referrals', modal: 'pair' }],
  ])('parses %s', (location, expected) => {
    expect(parseUrl(location)).toMatchObject(expected);
  });

  it('parses a full location string and modal target', () => {
    expect(parseUrl(`https://connect.comma.ai/${DONGLE}?modal=settings&device=${OTHER}&ci=1`)).toMatchObject({
      page: 'dashboard', dongleId: DONGLE, modal: 'settings', targetDeviceId: OTHER,
    });
  });

  it.each([
    [`/${DONGLE}/${LOG}/2/2`, 'dashboard'],
    [`/${DONGLE}/${LOG}/-1/2`, 'dashboard'],
    [`/${DONGLE}/${LOG}/0/${OVERFLOW_SECONDS}`, 'dashboard'],
    [`/${DONGLE}/${LOG}/1/2/extra`, 'dashboard'],
    [`/${DONGLE}/1/2/extra`, 'dashboard'],
    [`/${DONGLE}/0/20`, 'legacy'],
  ])('validates suffix shape in %s', (location, page) => {
    expect(parseUrl(location).page).toBe(page);
  });

  it('builds drive and modal URLs without losing other location state', () => {
    expect(buildUrl({
      page: 'drive', dongleId: DONGLE, routeId: LOG,
      zoom: { start: 0, end: 10001 }, modal: 'uploads', targetDeviceId: OTHER,
    }, '/referrals?ci=1#timeline')).toBe(
      `/${DONGLE}/${LOG}/0/11?ci=1&modal=uploads&device=${OTHER}#timeline`,
    );
  });

  it('opens and closes a modal on global pages', () => {
    const current = '/referrals?ci=1';
    expect(buildUrl({ ...parseUrl(current), modal: 'pair' }, current)).toBe('/referrals?ci=1&modal=pair');
    expect(buildUrl({ ...parseUrl('/referrals?ci=1&modal=pair'), modal: null }, '/referrals?ci=1&modal=pair'))
      .toBe('/referrals?ci=1');
  });

  it('keeps demo navigation on the demo backend path', () => {
    expect(buildUrl({ ...parseUrl('/demo'), page: 'drive', routeId: LOG, zoom: null }, '/demo?ci=1'))
      .toBe(`/demo/${LOG}?ci=1`);
  });

  it('accepts only same-origin return paths', () => {
    expect(sameOriginPath(`/${DONGLE}/${LOG}?modal=filter#video`)).toBe(`/${DONGLE}/${LOG}?modal=filter#video`);
    expect(sameOriginPath('https://example.com/private')).toBeNull();
    expect(sameOriginPath('//example.com/private')).toBeNull();
  });
});
