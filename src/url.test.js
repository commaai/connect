import { describe, expect, it } from 'vitest';

import { buildUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const empty = { dongleId: null, page: null, logId: null, zoom: null, legacyRange: null };

describe('parseUrl', () => {
  it.each([
    ['/', empty],
    ['/demo', empty],
    ['/auth/code/provider', empty],
    ['/referrals', { ...empty, page: 'referrals' }],
    [`/${DONGLE}`, { ...empty, dongleId: DONGLE, page: 'dashboard' }],
    [`/${DONGLE}/`, { ...empty, dongleId: DONGLE, page: 'dashboard' }],
    [`/${DONGLE}/prime`, { ...empty, dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { ...empty, dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/settings`, { ...empty, dongleId: DONGLE, page: 'settings' }],
    [`/${DONGLE}/prime/extra`, { ...empty, dongleId: DONGLE, page: 'dashboard' }],
    [`/${DONGLE}/unknown`, { ...empty, dongleId: DONGLE, page: 'dashboard' }],
    ['/not-a-device/prime', empty],
    [`/${DONGLE}0/prime`, empty],
    [`/${DONGLE}/${LOG}`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/20/10`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG }],
    [`/${DONGLE}/${LOG}/10`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG }],
    [`/${DONGLE}/${LOG}/a/b`, { ...empty, dongleId: DONGLE, page: 'drive', logId: LOG }],
    [`/${DONGLE}/10/20`, { ...empty, dongleId: DONGLE, page: 'dashboard', legacyRange: { start: 10, end: 20 } }],
    [`/${DONGLE}/10/20/ignored`, { ...empty, dongleId: DONGLE, page: 'dashboard', legacyRange: { start: 10, end: 20 } }],
    [`/${DONGLE}/10`, { ...empty, dongleId: DONGLE, page: 'dashboard' }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });
});

describe('buildUrl', () => {
  it.each([
    [{}, '/'],
    [{ page: 'dashboard' }, '/'],
    [{ dongleId: DONGLE, page: 'referrals' }, '/referrals'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'dashboard' }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'prime' }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: 'stream' }, `/${DONGLE}/stream`],
    [{ dongleId: DONGLE, page: 'settings' }, `/${DONGLE}/settings`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, page: 'prime', logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 10500, end: 20900 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 123, end: 456 } }, `/${DONGLE}/${LOG}`],
  ])('%j', (url, expected) => {
    expect(buildUrl(url)).toBe(expected);
  });

  it.each([
    '/', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`, `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/0/20`, `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });
});
