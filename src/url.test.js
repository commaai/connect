import { describe, expect, it } from 'vitest';

import { Dialog, Page, parseLocation, selectLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const location = (pathname, search = '') => ({ pathname, search });
const parsed = (fields) => ({ dongleId: null, logId: null, range: null, dialog: null, ...fields });

describe('parseLocation', () => {
  it.each([
    ['/', { page: Page.HOME }],
    ['/demo', { page: Page.HOME }],
    ['/auth/', { page: Page.AUTH }],
    ['/auth/g/redirect', { page: Page.AUTH }],
    ['/referrals', { page: Page.REFERRALS }],
    [`/${DONGLE}`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: Page.DASHBOARD, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: Page.PRIME, dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: Page.STREAM, dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/10/20`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { page: Page.DRIVE, dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { page: Page.LEGACY, dongleId: DONGLE, range: { start: 1000, end: 2000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseLocation(location(pathname))).toEqual(parsed(expected));
  });

  it.each([
    ['an invalid range', `/${DONGLE}/${LOG}/20/10`],
    ['an empty range', `/${DONGLE}/${LOG}/10/10`],
    ['a non-numeric range', `/${DONGLE}/${LOG}/a/b`],
  ])('shows the whole drive for %s', (_name, pathname) => {
    expect(parseLocation(location(pathname))).toEqual(parsed({ page: Page.DRIVE, dongleId: DONGLE, logId: LOG }));
  });

  it.each([
    ['a short device id', '/0000aaaa'],
    ['an unknown device page', `/${DONGLE}/unknown`],
    ['a drive with half a range', `/${DONGLE}/${LOG}/10`],
    ['an invalid legacy range', `/${DONGLE}/2000/1000`],
    ['extra parts', `/${DONGLE}/prime/extra`],
    ['referrals under a device', `/${DONGLE}/referrals`],
  ])('goes home for %s', (_name, pathname) => {
    expect(parseLocation(location(pathname))).toEqual(parsed({ page: Page.HOME }));
  });

  it('reads the dialog', () => {
    expect(parseLocation(location(`/${DONGLE}/${LOG}`, '?dialog=settings'))).toEqual(
      parsed({ page: Page.DRIVE, dongleId: DONGLE, logId: LOG, dialog: Dialog.SETTINGS }),
    );
  });

  it('ignores unknown dialogs', () => {
    expect(parseLocation(location(`/${DONGLE}`, '?dialog=unknown')).dialog).toBeNull();
  });
});

describe('urlFor', () => {
  it.each([
    [{ page: Page.HOME }, '/'],
    [{ page: Page.DASHBOARD }, '/'],
    [{ page: Page.REFERRALS, dongleId: DONGLE }, '/referrals'],
    [{ page: Page.DASHBOARD, dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: Page.PRIME, dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: Page.STREAM, dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: Page.DRIVE, dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: Page.DRIVE, dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ page: Page.DRIVE, dongleId: DONGLE, logId: LOG, range: { start: 10500, end: 19500 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ page: Page.DASHBOARD, dongleId: DONGLE, dialog: Dialog.ADD_DEVICE }, `/${DONGLE}?dialog=add-device`],
  ])('%o is %s', (destination, expected) => {
    expect(urlFor(destination)).toBe(expected);
  });

  it.each([
    '/', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/10/20`, `/${DONGLE}?dialog=filter`, `/${DONGLE}/${LOG}?dialog=settings`,
  ])('writes back what it read from %s', (url) => {
    const [pathname, search] = url.split('?');
    expect(urlFor(parseLocation(location(pathname, search ? `?${search}` : '')))).toBe(url);
  });
});

describe('selectLocation', () => {
  it('parses each location once', () => {
    const state = { router: { location: location(`/${DONGLE}/prime`) } };
    expect(selectLocation(state)).toBe(selectLocation(state));
    expect(selectLocation(state).page).toBe(Page.PRIME);
    expect(selectLocation({ router: { location: location(`/${DONGLE}`) } }).page).toBe(Page.DASHBOARD);
  });
});
