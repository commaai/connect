import { describe, expect, it } from 'vitest';

import { buildUrl, isPublicPage, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NEW_LOG = '0000010a--a51155e496';

const loc = (page, dongleId = null, logId = null, zoom = null) => ({ page, dongleId, logId, zoom });

describe('parseUrl', () => {
  it.each([
    ['/', loc('home')],
    ['/demo', loc('home')],
    ['/auth/callback', loc('home')],
    ['/referrals', loc('referrals')],
    [`/${DONGLE}`, loc('dashboard', DONGLE)],
    [`/${DONGLE}/`, loc('dashboard', DONGLE)],
    [`/${DONGLE}/prime`, loc('prime', DONGLE)],
    [`/${DONGLE}/stream`, loc('stream', DONGLE)],
    [`/${DONGLE}/settings`, loc('settings', DONGLE)],
    [`/${DONGLE}/${LOG}`, loc('drive', DONGLE, LOG)],
    [`/${DONGLE}/${NEW_LOG}`, loc('drive', DONGLE, NEW_LOG)],
    [`/${DONGLE}/${LOG}/556/610`, loc('drive', DONGLE, LOG, { start: 556000, end: 610000 })],
    [`/${DONGLE}/${LOG}/0/20`, loc('drive', DONGLE, LOG, { start: 0, end: 20000 })],
    [`/${DONGLE}/${LOG}/10`, loc('drive', DONGLE, LOG)],
    [`/${DONGLE}/${LOG}/25/25`, loc('drive', DONGLE, LOG)],
    [`/${DONGLE}/${LOG}/30/20`, loc('drive', DONGLE, LOG)],
    [`/${DONGLE}/1000/2000`, loc('legacyRange', DONGLE, null, { start: 1000, end: 2000 })],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/unknown`,
    `/${DONGLE}/10`,
  ])('falls back to the dashboard for unknown device paths (%s)', (pathname) => {
    expect(parseUrl(pathname)).toEqual(loc('dashboard', DONGLE));
  });

  it.each(['/not-a-device/prime', '/0000aaaa0000aaaz', '/0000aaaa0000aaaa0'])('needs a valid dongle id (%s)', (pathname) => {
    expect(parseUrl(pathname)).toEqual(loc('home'));
  });
});

describe('buildUrl', () => {
  it.each([
    [loc('home'), '/'],
    [loc('referrals', DONGLE), '/referrals'],
    [loc('dashboard', DONGLE), `/${DONGLE}`],
    [loc('dashboard'), '/'],
    [loc('prime', DONGLE), `/${DONGLE}/prime`],
    [loc('stream', DONGLE), `/${DONGLE}/stream`],
    [loc('settings', DONGLE), `/${DONGLE}/settings`],
    [loc('drive', DONGLE, LOG), `/${DONGLE}/${LOG}`],
    [loc('drive', DONGLE, LOG, { start: 0, end: 20000 }), `/${DONGLE}/${LOG}/0/20`],
    [loc('drive', DONGLE, LOG, { start: 10999, end: 20500 }), `/${DONGLE}/${LOG}/10/21`],
    [loc('drive', DONGLE, LOG, { start: 25300, end: 25900 }), `/${DONGLE}/${LOG}/25/26`],
  ])('%j', (location, expected) => {
    expect(buildUrl(location)).toBe(expected);
  });

  it.each([
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
  ])('round-trips %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });
});

describe('isPublicPage', () => {
  it.each([
    ['drive', true],
    ['legacyRange', true],
    ['dashboard', false],
    ['prime', false],
    ['home', false],
  ])('%s', (page, expected) => {
    expect(isPublicPage(page)).toBe(expected);
  });
});
