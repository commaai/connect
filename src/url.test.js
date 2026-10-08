import { describe, expect, it } from 'vitest';

import { parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', { dongleId: null, page: null, logId: null, zoom: null }],
    ['/referrals', { dongleId: null, page: 'referrals', logId: null, zoom: null }],
    [`/${DONGLE}`, { dongleId: DONGLE, page: 'dashboard', logId: null, zoom: null }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime', logId: null, zoom: null }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream', logId: null, zoom: null }],
    [`/${DONGLE}/settings`, { dongleId: DONGLE, page: 'settings', logId: null, zoom: null }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, page: 'drive', logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, page: 'drive', logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1754481600000/1754481660000`, {
      dongleId: DONGLE, page: 'drive', logId: null, zoom: { start: 1754481600000, end: 1754481660000 },
    }],
    [`/${DONGLE}/prime/extra`, { dongleId: DONGLE, page: null, logId: null, zoom: null }],
    ['/not-a-device/prime', { dongleId: null, page: null, logId: null, zoom: null }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`, `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/0/20`, '/referrals',
  ])('urlFor(parseUrl(%s)) round-trips', (pathname) => {
    expect(urlFor(parseUrl(pathname))).toBe(pathname);
  });
});
