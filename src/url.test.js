import { describe, expect, it } from 'vitest';

import { Page, parseUrl, deviceUrl, driveUrl, primeUrl, settingsUrl, streamUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', { page: Page.HOME }],
    ['/referrals', { page: Page.REFERRALS }],
    ['/not-a-device', { page: Page.HOME }],
    ['/auth/code/provider', { page: Page.HOME }],
    [`/${DONGLE}`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { page: Page.SETTINGS, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: Page.PRIME, dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: Page.STREAM, dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/unknown`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}x`, { page: Page.HOME }],
    [`/${DONGLE}/${LOG}`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/20/10`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/1.5/20`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/1000/2000`, { page: Page.DASHBOARD, dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/2000/1000`, { page: Page.DASHBOARD, dongleId: DONGLE }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual({ dongleId: null, logId: null, zoom: null, legacyRange: null, ...expected });
  });
});

describe('url builders', () => {
  it.each([
    [deviceUrl(DONGLE), `/${DONGLE}`],
    [deviceUrl(null), '/'],
    [settingsUrl(DONGLE), `/${DONGLE}/settings`],
    [primeUrl(DONGLE), `/${DONGLE}/prime`],
    [streamUrl(DONGLE), `/${DONGLE}/stream`],
    [driveUrl(DONGLE, LOG), `/${DONGLE}/${LOG}`],
    [driveUrl(DONGLE, LOG, { start: 10000, end: 20000 }), `/${DONGLE}/${LOG}/10/20`],
    [driveUrl(DONGLE, LOG, { start: 0, end: 20000 }), `/${DONGLE}/${LOG}/0/20`],
    [driveUrl(DONGLE, LOG, { start: 10400, end: 10600 }), `/${DONGLE}/${LOG}/10/11`],
  ])('%s', (url, expected) => {
    expect(url).toBe(expected);
  });

  it.each([
    [`/${DONGLE}`], [`/${DONGLE}/settings`], [`/${DONGLE}/prime`], [`/${DONGLE}/stream`],
    [`/${DONGLE}/${LOG}`], [`/${DONGLE}/${LOG}/10/20`],
  ])('building the URL that %s parses to gives back the same URL', (pathname) => {
    const { page, dongleId, logId, zoom } = parseUrl(pathname);
    const build = {
      [Page.DASHBOARD]: () => deviceUrl(dongleId),
      [Page.SETTINGS]: () => settingsUrl(dongleId),
      [Page.PRIME]: () => primeUrl(dongleId),
      [Page.STREAM]: () => streamUrl(dongleId),
      [Page.DRIVE]: () => driveUrl(dongleId, logId, zoom),
    }[page];
    expect(build()).toBe(pathname);
  });
});
