import { describe, expect, it } from 'vitest';

import { Page, parseUrl, buildUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const url = (page, fields) => ({ page, dongleId: null, logId: null, zoom: null, legacyRange: null, ...fields });

describe('parseUrl', () => {
  it.each([
    ['/', url(Page.HOME)],
    ['/referrals', url(Page.REFERRALS)],
    [`/${DONGLE}`, url(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/`, url(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/prime`, url(Page.PRIME, { dongleId: DONGLE })],
    [`/${DONGLE}/stream`, url(Page.STREAM, { dongleId: DONGLE })],
    [`/${DONGLE}/settings`, url(Page.SETTINGS, { dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, url(Page.DRIVE, { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/0/20`, url(Page.DRIVE, { dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${LOG}/556/610`, url(Page.DRIVE, { dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/1000/2000`, url(Page.DRIVE, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
  ])('parses %s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['15-char dongle id', '/0000aaaa0000aaa'],
    ['17-char dongle id', '/0000aaaa0000aaaa0'],
    ['padded dongle id', `/x${DONGLE}`],
    ['padded log id', `/${DONGLE}/x${LOG}`],
    ['unknown device page', `/${DONGLE}/garage`],
    ['extra segment after a device page', `/${DONGLE}/prime/extra`],
    ['extra segment after referrals', '/referrals/extra'],
    ['device page without a device', '/prime'],
    ['zoom with start == end', `/${DONGLE}/${LOG}/20/20`],
    ['zoom with start > end', `/${DONGLE}/${LOG}/20/10`],
    ['non-numeric zoom', `/${DONGLE}/${LOG}/10/2e1`],
    ['negative zoom', `/${DONGLE}/${LOG}/-10/20`],
    ['zoom with one bound', `/${DONGLE}/${LOG}/10`],
    ['zoom with an extra segment', `/${DONGLE}/${LOG}/10/20/30`],
    ['legacy range with start >= end', `/${DONGLE}/2000/1000`],
    ['non-numeric legacy range', `/${DONGLE}/abc/2000`],
    ['auth callback', '/auth/code/provider'],
  ])('treats a %s as home', (_name, pathname) => {
    expect(parseUrl(pathname)).toEqual(url(Page.HOME));
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
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('inverts parseUrl for %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });

  it.each([
    [{}, '/'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
  ])('infers the page from %j', (fields, expected) => {
    expect(buildUrl(fields)).toBe(expected);
  });

  it.each([
    [{ start: 10500, end: 20500 }, '10/21'],
    [{ start: 10200, end: 10400 }, '10/11'],
    [{ start: 10000, end: 20000 }, '10/20'],
  ])('rounds zoom %j outward to whole seconds', (zoom, expected) => {
    expect(buildUrl({ dongleId: DONGLE, logId: LOG, zoom })).toBe(`/${DONGLE}/${LOG}/${expected}`);
  });
});
