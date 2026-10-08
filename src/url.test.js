import { describe, expect, it } from 'vitest';

import { Page, parseUrl, deviceUrl, settingsUrl, primeUrl, streamUrl, driveUrl, REFERRALS_URL } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const state = (page, fields = {}) => ({ page, dongleId: null, logId: null, zoom: null, legacyRange: null, ...fields });

describe('parseUrl', () => {
  it.each([
    ['/', state(Page.HOME)],
    ['/demo', state(Page.HOME)],
    ['/not-a-device/prime', state(Page.HOME)],
    ['/referrals', state(Page.REFERRALS)],
    ['/referrals/extra', state(Page.HOME)],
    [`/${DONGLE}`, state(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/`, state(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/settings`, state(Page.SETTINGS, { dongleId: DONGLE })],
    [`/${DONGLE}/prime`, state(Page.PRIME, { dongleId: DONGLE })],
    [`/${DONGLE}/stream`, state(Page.STREAM, { dongleId: DONGLE })],
    [`/${DONGLE}/stream/extra`, state(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/unknown`, state(Page.DASHBOARD, { dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${LOG}/20/10`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/abc/20`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/1000/2000`, state(Page.DASHBOARD, { dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/2000/1000`, state(Page.DASHBOARD, { dongleId: DONGLE })],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });
});

describe('url helpers', () => {
  it.each([
    [REFERRALS_URL, '/referrals', state(Page.REFERRALS)],
    [deviceUrl(DONGLE), `/${DONGLE}`, state(Page.DASHBOARD, { dongleId: DONGLE })],
    [deviceUrl(null), '/', state(Page.HOME)],
    [settingsUrl(DONGLE), `/${DONGLE}/settings`, state(Page.SETTINGS, { dongleId: DONGLE })],
    [primeUrl(DONGLE), `/${DONGLE}/prime`, state(Page.PRIME, { dongleId: DONGLE })],
    [streamUrl(DONGLE), `/${DONGLE}/stream`, state(Page.STREAM, { dongleId: DONGLE })],
    [driveUrl(DONGLE, LOG), `/${DONGLE}/${LOG}`, state(Page.DRIVE, { dongleId: DONGLE, logId: LOG })],
    [
      driveUrl(DONGLE, LOG, { start: 10400, end: 20900 }),
      `/${DONGLE}/${LOG}/10/20`,
      state(Page.DRIVE, { dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }),
    ],
  ])('%s parses back', (url, expectedUrl, expectedState) => {
    expect(url).toBe(expectedUrl);
    expect(parseUrl(url)).toEqual(expectedState);
  });
});
