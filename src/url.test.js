import { describe, expect, it } from 'vitest';

import { anonymizeUrl, buildUrl, currentPage, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NEW_LOG = '000000dd--455f14369d';

const PAGES = [
  ['/', { page: 'home' }],
  ['/referrals', { page: 'referrals' }],
  [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
  [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
  [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
  [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
  [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG }],
  [`/${DONGLE}/${NEW_LOG}`, { page: 'drive', dongleId: DONGLE, logId: NEW_LOG }],
  [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 556000, end: 610000 }],
  [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }],
  [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, from: 1000, to: 2000 }],
];

describe('parseUrl', () => {
  it.each(PAGES)('%s', (pathname, location) => {
    expect(parseUrl(pathname)).toEqual(location);
  });

  it('ignores a trailing slash', () => {
    expect(parseUrl(`/${DONGLE}/prime/`)).toEqual({ page: 'prime', dongleId: DONGLE });
  });

  it.each([
    '/demo',
    '/auth/',
    '/auth/code/provider',
    '/prime',
    `/${DONGLE}/unknown`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/10/20/30`,
    `/${DONGLE}/${LOG}/ten/20`,
    `/${DONGLE}x`,
    `/x${DONGLE}`,
    `/${DONGLE.toUpperCase()}`,
  ])('%s is not a page', (pathname) => {
    expect(parseUrl(pathname)).toBeNull();
  });
});

describe('buildUrl', () => {
  it.each(PAGES)('%s', (pathname, location) => {
    expect(buildUrl(location)).toBe(pathname);
  });

  it('writes drive ranges in whole seconds', () => {
    expect(buildUrl({ page: 'drive', dongleId: DONGLE, logId: LOG, start: 1999, end: 5001 })).toBe(`/${DONGLE}/${LOG}/1/5`);
  });

  it('uses the short drive URL without a full range', () => {
    expect(buildUrl({ page: 'drive', dongleId: DONGLE, logId: LOG, start: 1000, end: null })).toBe(`/${DONGLE}/${LOG}`);
  });

  it.each([
    [{ page: 'dashboard', dongleId: null }],
    [{ page: 'drive', dongleId: DONGLE }],
    [{ page: 'nope' }],
  ])('goes home for a location it cannot show: %j', (location) => {
    expect(buildUrl(location)).toBe('/');
  });
});

describe('anonymizeUrl', () => {
  it.each([
    ['/', '/'],
    [`/${DONGLE}`, '/<dongleId>'],
    [`/${DONGLE}/prime`, '/<dongleId>/prime'],
    [`/${DONGLE}/${LOG}/10/20`, '/<dongleId>/<logId>/<start>/<end>'],
    ['/demo/', '/demo'],
  ])('%s', (pathname, expected) => {
    expect(anonymizeUrl(pathname)).toBe(expected);
  });
});

describe('currentPage', () => {
  it.each([
    [`/${DONGLE}/settings`, 'settings'],
    ['/demo', null],
  ])('%s', (pathname, page) => {
    expect(currentPage({ router: { location: { pathname } } })).toBe(page);
  });
});
