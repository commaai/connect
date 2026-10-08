import { describe, expect, it } from 'vitest';

import { buildUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const page = (fields) => ({ page: 'root', dongleId: null, logId: null, zoom: null, legacyRange: null, ...fields });

describe('parseUrl', () => {
  it.each([
    ['/', page()],
    ['/referrals', page({ page: 'referrals' })],
    [`/${DONGLE}`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, page({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, page({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/settings`, page({ page: 'settings', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, page({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, page({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1000/2000`, page({ page: 'dashboard', dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['an unknown top-level page', '/prime', page()],
    ['a dongle id of the wrong length', '/0000aaaa0000aaaa0/prime', page()],
    ['the sign in callback', '/auth/code/provider', page()],
    ['an unknown device page', `/${DONGLE}/nope`, page({ page: 'dashboard', dongleId: DONGLE })],
    ['extra segments after a device page', `/${DONGLE}/prime/extra`, page({ page: 'dashboard', dongleId: DONGLE })],
    ['a drive with half a range', `/${DONGLE}/${LOG}/10`, page({ page: 'dashboard', dongleId: DONGLE })],
    ['a drive with a non-numeric range', `/${DONGLE}/${LOG}/a/b`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    ['a drive with an empty range', `/${DONGLE}/${LOG}/20/20`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    ['a backwards legacy range', `/${DONGLE}/2000/1000`, page({ page: 'dashboard', dongleId: DONGLE })],
  ])('falls back gracefully for %s', (_name, pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });
});

describe('buildUrl', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/${LOG}/0/20`,
  ])('round-trips %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });

  it.each([
    ['a drive from its log id', { dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    ['the dashboard by default', { dongleId: DONGLE }, `/${DONGLE}`],
    ['the root without a device', { page: 'prime' }, '/'],
    ['a zoom in whole seconds', { dongleId: DONGLE, logId: LOG, zoom: { start: 1999, end: 4001 } }, `/${DONGLE}/${LOG}/1/4`],
  ])('builds %s', (_name, target, expected) => {
    expect(buildUrl(target)).toBe(expected);
  });
});
