import { describe, expect, it } from 'vitest';

import { parseLocation, toPath } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NEW_LOG = '0000002b--c9a54a5bc0';

const empty = { dongleId: null, page: null, routeId: null, range: null, legacyRange: null, modal: null };

describe('parseLocation', () => {
  it.each([
    ['/', {}],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${NEW_LOG}`, { dongleId: DONGLE, routeId: NEW_LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, routeId: LOG, range: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, routeId: LOG, range: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual({ ...empty, ...expected });
  });

  it.each([
    ['/', '?modal=pair', { modal: 'pair' }],
    [`/${DONGLE}`, '?modal=settings', { dongleId: DONGLE, modal: 'settings' }],
    [`/${DONGLE}`, '?modal=filter&ci=1', { dongleId: DONGLE, modal: 'filter' }],
    [`/${DONGLE}/${LOG}`, '?modal=settings', { dongleId: DONGLE, routeId: LOG, modal: 'settings' }],
    [`/${DONGLE}`, '?modal=unknown', { dongleId: DONGLE }],
  ])('%s%s', (pathname, search, expected) => {
    expect(parseLocation(pathname, search)).toEqual({ ...empty, ...expected });
  });

  it.each([
    ['an unknown page', '/prime', {}],
    ['settings as a page', `/${DONGLE}/settings`, { dongleId: DONGLE }],
    ['a short dongle id', '/0000aaaa', {}],
    ['a long dongle id', `/${DONGLE}0`, {}],
    ['a page with extra parts', `/${DONGLE}/prime/extra`, { dongleId: DONGLE }],
    ['referrals under a device', `/${DONGLE}/referrals`, { dongleId: DONGLE }],
    ['an incomplete range', `/${DONGLE}/${LOG}/10`, { dongleId: DONGLE, routeId: LOG }],
    ['a range with extra parts', `/${DONGLE}/${LOG}/10/20/30`, { dongleId: DONGLE, routeId: LOG }],
    ['a reversed range', `/${DONGLE}/${LOG}/20/10`, { dongleId: DONGLE, routeId: LOG }],
    ['a non-numeric range', `/${DONGLE}/${LOG}/1e3/2e3`, { dongleId: DONGLE, routeId: LOG }],
    ['an incomplete legacy range', `/${DONGLE}/1000`, { dongleId: DONGLE }],
    ['an auth callback', '/auth/code/provider', {}],
  ])('ignores %s', (_name, pathname, expected) => {
    expect(parseLocation(pathname)).toEqual({ ...empty, ...expected });
  });
});

describe('toPath', () => {
  it.each([
    ['/', {}],
    ['/referrals', { dongleId: DONGLE, page: 'referrals' }],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}?modal=settings`, { dongleId: DONGLE, modal: 'settings' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, routeId: LOG, range: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, routeId: LOG, range: { start: 10999, end: 20001 } }],
    [`/${DONGLE}/${LOG}/1/2`, { dongleId: DONGLE, routeId: LOG, range: { start: 1200, end: 1800 } }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
  ])('%s', (expected, location) => {
    expect(toPath(location)).toBe(expected);
  });

  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/1000/2000`,
    `/${DONGLE}/${LOG}?modal=settings`,
    '/referrals?modal=pair',
  ])('round trips %s', (url) => {
    const [pathname, search] = url.split('?');
    expect(toPath(parseLocation(pathname, search && `?${search}`))).toBe(url);
  });
});

