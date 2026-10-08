import { describe, expect, it } from 'vitest';

import { DIALOGS, PAGES, dialogUrl, driveUrl, parseUrl, selectUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const EMPTY = { dongleId: null, page: null, logId: null, zoom: null, legacyRange: null, dialog: null };

describe('parseUrl', () => {
  it.each([
    ['/', EMPTY],
    ['/referrals', { ...EMPTY, page: PAGES.REFERRALS }],
    ['/auth/code/provider', EMPTY],
    [`/${DONGLE}`, { ...EMPTY, dongleId: DONGLE }],
    [`/${DONGLE}/`, { ...EMPTY, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { ...EMPTY, dongleId: DONGLE, page: PAGES.PRIME }],
    [`/${DONGLE}/stream`, { ...EMPTY, dongleId: DONGLE, page: PAGES.STREAM }],
    [`/${DONGLE}/prime/extra`, { ...EMPTY, dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { ...EMPTY, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { ...EMPTY, dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { ...EMPTY, dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { ...EMPTY, dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/10`, { ...EMPTY, dongleId: DONGLE }],
    ['/not-a-device/prime', EMPTY],
    [`/${DONGLE.toUpperCase()}/PRIME`, EMPTY],
    ['/prime', EMPTY],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['?dialog=settings', DIALOGS.SETTINGS],
    ['?dialog=unknown', null],
    ['?r=/elsewhere', null],
  ])('reads the dialog from %s', (search, dialog) => {
    expect(parseUrl(`/${DONGLE}/${LOG}`, search)).toEqual({ ...EMPTY, dongleId: DONGLE, logId: LOG, dialog });
  });
});

describe('urlFor', () => {
  it.each([
    [{}, '/'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, page: PAGES.PRIME }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, page: PAGES.REFERRALS }, '/referrals'],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 10500, end: 20900 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
  ])('%j', (params, expected) => {
    expect(urlFor(params)).toBe(expected);
  });

  it.each([
    '/', '/referrals', `/${DONGLE}`, `/${DONGLE}/stream`, `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/10/20`,
  ])('round-trips %s', (pathname) => {
    expect(urlFor(parseUrl(pathname))).toBe(pathname);
  });
});

describe('dialogUrl', () => {
  it('opens a dialog over a page', () => {
    expect(dialogUrl(`/${DONGLE}/${LOG}`, DIALOGS.SETTINGS)).toBe(`/${DONGLE}/${LOG}?dialog=settings`);
    expect(dialogUrl(`/${DONGLE}`, null)).toBe(`/${DONGLE}`);
  });
});

describe('driveUrl', () => {
  const state = { dongleId: DONGLE, routes: [{ log_id: LOG, duration: 60000 }] };

  it.each([
    ['no zoom', null, `/${DONGLE}/${LOG}`],
    ['a zoom spanning the whole drive', { start: 0, end: 60000 }, `/${DONGLE}/${LOG}`],
    ['a zoom', { start: 10000, end: 20000 }, `/${DONGLE}/${LOG}/10/20`],
    ['a zoom from the drive start', { start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
  ])('drops or keeps %s', (_name, zoom, expected) => {
    expect(driveUrl(state, LOG, zoom)).toBe(expected);
  });
});

describe('selectUrl', () => {
  it('reparses only when the router location changes', () => {
    const location = { pathname: `/${DONGLE}/prime`, search: '' };
    const url = selectUrl({ router: { location } });
    expect(url).toEqual({ ...EMPTY, dongleId: DONGLE, page: PAGES.PRIME });
    expect(selectUrl({ router: { location } })).toBe(url);
    expect(selectUrl({ router: { location: { ...location } } })).not.toBe(url);
  });
});
