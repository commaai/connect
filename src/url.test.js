import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const drive = (range) => ({ page: 'drive', dongleId: DONGLE, logId: LOG, range });
const NOT_FOUND = { page: 'not-found' };

describe('destinationFromUrl', () => {
  it.each([
    ['/', { page: 'root' }],
    ['/demo/', { page: 'demo' }],
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}/0/20`, drive({ start: 0, end: 20000 })],
    [`/${DONGLE}/${LOG}/20/10`, drive(null)],
    [`/${DONGLE}/${LOG}/1.5/20`, drive(null)],
    [`/${DONGLE}/10/20`, { page: 'legacy-drive', dongleId: DONGLE, range: { start: 10, end: 20 } }],
    [`/${DONGLE}/20/10`, NOT_FOUND],
    [`/x${DONGLE}`, NOT_FOUND],
    [`/${DONGLE}/x${LOG}`, NOT_FOUND],
    [`/${DONGLE}/prime/extra`, NOT_FOUND],
    [`/${DONGLE}/${LOG}/10`, NOT_FOUND],
    ['/auth/code/provider', NOT_FOUND],
  ])('%s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });
});

describe('urlForDestination', () => {
  it.each([
    { page: 'root' },
    { page: 'referrals' },
    { page: 'dashboard', dongleId: DONGLE },
    { page: 'prime', dongleId: DONGLE },
    { page: 'stream', dongleId: DONGLE },
    { page: 'settings', dongleId: DONGLE },
    drive(null),
    drive({ start: 0, end: 20000 }),
  ])('round-trips %o', (destination) => {
    expect(destinationFromUrl(urlForDestination(destination))).toEqual(destination);
  });

  it.each([
    [drive({ start: 1200, end: 1700 }), `/${DONGLE}/${LOG}/1/2`],
    [{ page: 'dashboard', dongleId: null }, '/'],
  ])('builds %o as %s', (destination, url) => {
    expect(urlForDestination(destination)).toBe(url);
  });
});
