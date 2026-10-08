import { describe, expect, it } from 'vitest';

import { parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const location = (fields) => ({ page: 'home', dongleId: null, logId: null, zoom: null, ...fields });

describe('parseUrl', () => {
  it.each([
    ['/', location({})],
    ['/demo', location({})],
    ['/not-a-device', location({})],
    ['/referrals', location({ page: 'referrals' })],
    [`/${DONGLE}`, location({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, location({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, location({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/settings`, location({ page: 'settings', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, location({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, location({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, location({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, location({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1000/2000`, location({ page: 'legacy', dongleId: DONGLE, zoom: { start: 1000, end: 2000 } })],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['an empty', `/${DONGLE}/${LOG}/20/20`],
    ['a reversed', `/${DONGLE}/${LOG}/20/10`],
    ['a non-numeric', `/${DONGLE}/${LOG}/a/b`],
  ])('opens the whole drive for %s range', (_name, pathname) => {
    expect(parseUrl(pathname)).toEqual(location({ page: 'drive', dongleId: DONGLE, logId: LOG }));
  });

  it.each([
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/unknown`,
    `/${DONGLE}/1000`,
  ])('falls back to the dashboard for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual(location({ page: 'dashboard', dongleId: DONGLE }));
  });

  it.each([
    `/x${DONGLE}`,
    `/${DONGLE}x`,
    '/referrals/extra',
  ])('matches whole segments only: %s', (pathname) => {
    expect(parseUrl(pathname).page).toBe('home');
  });
});

describe('urlFor', () => {
  it.each([
    [{}, '/'],
    [{ page: 'referrals', dongleId: DONGLE }, '/referrals'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: 'prime' }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: 'settings' }, `/${DONGLE}/settings`],
    [{ dongleId: DONGLE, page: 'stream' }, `/${DONGLE}/stream`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 25400, end: 25600 } }, `/${DONGLE}/${LOG}/25/26`],
  ])('%j', (fields, expected) => {
    expect(urlFor(fields)).toBe(expected);
  });

  it.each([
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    '/referrals',
    '/',
  ])('round-trips %s', (pathname) => {
    expect(urlFor(parseUrl(pathname))).toBe(pathname);
  });
});
