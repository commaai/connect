import { describe, expect, it } from 'vitest';

import { parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const urls = [
  ['/', { page: 'home' }],
  ['/referrals', { page: 'referrals' }],
  [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
  [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
  [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
  [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
  [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, routeId: LOG }],
  [`/${DONGLE}/${LOG}/0/20`, { page: 'zoom', dongleId: DONGLE, routeId: LOG, start: 0, end: 20 }],
  [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }],
];

describe('url', () => {
  it.each(urls)('parses %s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each(urls)('builds %s', (pathname, { page, ...params }) => {
    expect(urlFor(page, params)).toBe(pathname);
  });

  it.each([
    [`/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}/10`, { page: 'drive', dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/10/twenty`, { page: 'drive', dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/unknown`, { page: 'dashboard', dongleId: DONGLE }],
    ['/demo', { page: 'home' }],
    ['/auth/g/redirect', { page: 'home' }],
  ])('reads %s as its longest known prefix', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    `/x${DONGLE}`,
    `/${DONGLE}x`,
    `/${DONGLE.toUpperCase()}`,
    `/${DONGLE}/../${DONGLE}`,
    `//evil.example/${DONGLE}`,
    `/${DONGLE}/x${LOG}`,
    `/${DONGLE}/${LOG}/-1/20`,
    `/${DONGLE}/${LOG}/1e3/2e3`,
    `/${DONGLE}/${'9'.repeat(14)}/${'9'.repeat(14)}`,
  ])('never takes a parameter it cannot validate from %s', (pathname) => {
    const { page, ...params } = parseUrl(pathname);
    expect(parseUrl(urlFor(page, params))).toEqual({ page, ...params });
    expect(urlFor(page, params)).not.toContain('x');
    expect(Object.values(params).every((value) => /^[a-f0-9-]+$/.test(String(value)))).toBe(true);
  });
});
