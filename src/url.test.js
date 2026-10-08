import { describe, expect, it } from 'vitest';

import { parseUrl, deviceUrl, driveUrl, primeUrl, streamUrl, settingsUrl, REFERRALS_URL } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const url = (fields) => ({
  page: 'home', dongleId: null, logId: null, zoom: null, legacyRange: null, settings: null, ...fields,
});

describe('parseUrl', () => {
  it.each([
    ['/', url({})],
    ['/demo', url({})],
    ['/not-a-device/prime', url({})],
    ['/referrals', url({ page: 'referrals' })],
    [`/${DONGLE}`, url({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, url({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, url({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, url({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/prime/extra`, url({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, url({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, url({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, url({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${LOG}/20/10`, url({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/10/x`, url({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/10`, url({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/1000/2000`, url({ page: 'legacy', dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/2000/1000`, url({ page: 'dashboard', dongleId: DONGLE })],
  ])('%s', (pathname, expected) => {
    expect(parseUrl({ pathname })).toEqual(expected);
  });

  it('reads the settings dialog from the query', () => {
    expect(parseUrl({ pathname: `/${DONGLE}/${LOG}`, search: `?settings=${OTHER}` }))
      .toMatchObject({ page: 'drive', dongleId: DONGLE, settings: OTHER });
    expect(parseUrl({ pathname: '/referrals', search: `?settings=${OTHER}` }))
      .toMatchObject({ page: 'referrals', settings: OTHER });
    expect(parseUrl({ pathname: `/${DONGLE}`, search: '?settings=nope' }).settings).toBeNull();
  });
});

describe('URL builders', () => {
  it('build the URLs parseUrl reads', () => {
    expect(deviceUrl(DONGLE)).toBe(`/${DONGLE}`);
    expect(deviceUrl(null)).toBe('/');
    expect(primeUrl(DONGLE)).toBe(`/${DONGLE}/prime`);
    expect(streamUrl(DONGLE)).toBe(`/${DONGLE}/stream`);
    expect(REFERRALS_URL).toBe('/referrals');
    expect(driveUrl(DONGLE, LOG)).toBe(`/${DONGLE}/${LOG}`);
    expect(driveUrl(DONGLE, LOG, { start: 0, end: 20000 })).toBe(`/${DONGLE}/${LOG}/0/20`);
  });

  it('widens a drive zoom to whole seconds', () => {
    expect(driveUrl(DONGLE, LOG, { start: 12345, end: 12678 })).toBe(`/${DONGLE}/${LOG}/12/13`);
    expect(parseUrl({ pathname: driveUrl(DONGLE, LOG, { start: 12345, end: 12678 }) }).zoom)
      .toEqual({ start: 12000, end: 13000 });
  });

  it('opens and closes settings over the current page', () => {
    const opened = settingsUrl({ pathname: `/${DONGLE}/${LOG}/10/20`, search: '' }, OTHER);
    expect(opened).toBe(`/${DONGLE}/${LOG}/10/20?settings=${OTHER}`);
    expect(settingsUrl({ pathname: `/${DONGLE}/${LOG}/10/20`, search: `?settings=${OTHER}` }, null))
      .toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(settingsUrl({ pathname: `/${DONGLE}`, search: `?ci=1&settings=${OTHER}` }, null)).toBe(`/${DONGLE}?ci=1`);
  });
});
