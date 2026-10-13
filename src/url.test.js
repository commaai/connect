import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL destinations', () => {
  it.each([
    ['/', { page: 'root' }],
    ['/demo', { page: 'root' }],
    ['/not-a-device/prime', { page: 'root' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/unknown`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/20/10`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/10/x`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, zoom: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/10`, { page: 'dashboard', dongleId: DONGLE }],
  ])('reads %s', (pathname, destination) => {
    expect(destinationFromUrl(pathname)).toEqual(destination);
  });

  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('writes %s back unchanged', (pathname) => {
    expect(urlForDestination(destinationFromUrl(pathname))).toBe(pathname);
  });

  it('keeps a range shorter than a second in the URL', () => {
    expect(urlForDestination({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 1200, end: 1800 } }))
      .toBe(`/${DONGLE}/${LOG}/1/2`);
  });
});
