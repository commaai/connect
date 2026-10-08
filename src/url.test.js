import { describe, expect, it } from 'vitest';

import { buildUrl, parseLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseLocation', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/referrals', { page: 'referrals' }],
    ['/prime', { page: 'home' }],
    ['/not-a-device/prime', { page: 'home' }],
    ['/auth/code/provider', { page: 'home' }],
    [`/${DONGLE}`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/stream/extra`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/10/20`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }],
    [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }],
    [`/${DONGLE}/${LOG}/20/10`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}/10`, { page: 'dash', dongleId: DONGLE }],
    [`/${DONGLE}/1786017600000/1786017660000`, { page: 'dash', dongleId: DONGLE }],
  ])('parseLocation(%s)', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual(expected);
  });
});

describe('buildUrl', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('builds back the url it parsed: %s', (pathname) => {
    expect(buildUrl(parseLocation(pathname))).toBe(pathname);
  });

  it('floors a range to whole seconds', () => {
    expect(buildUrl({ page: 'drive', dongleId: DONGLE, logId: LOG, start: 10_400, end: 20_900 })).toBe(`/${DONGLE}/${LOG}/10/20`);
  });
});
