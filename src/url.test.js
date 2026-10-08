import { describe, expect, it } from 'vitest';

import { buildUrl, isSafeRedirect, parseUrl, withDialog } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const NO_DIALOGS = { settings: null, 'add-device': false, filter: false };

const page = (fields) => ({ dongleId: null, logId: null, range: null, dialogs: NO_DIALOGS, ...fields });

describe('parseUrl', () => {
  it.each([
    ['/', page({ page: 'root' })],
    ['/demo', page({ page: 'root' })],
    ['/prime', page({ page: 'root' })],
    ['/auth/code/provider', page({ page: 'root' })],
    ['/referrals', page({ page: 'referrals' })],
    [`/${DONGLE}`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, page({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, page({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, page({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, page({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/10/20`, page({ page: 'legacy', dongleId: DONGLE, range: { start: 10, end: 20 } })],
    [`/${DONGLE}/0/20/ignored`, page({ page: 'legacy', dongleId: DONGLE, range: { start: 0, end: 20 } })],
  ])('reads %s', (pathname, expected) => {
    expect(parseUrl({ pathname })).toEqual(expected);
  });

  it.each([
    ['an empty range', `/${DONGLE}/${LOG}/20/20`],
    ['a reversed range', `/${DONGLE}/${LOG}/20/10`],
    ['a half range', `/${DONGLE}/${LOG}/10`],
    ['a non-numeric range', `/${DONGLE}/${LOG}/1e3/2e3`],
  ])('reads a drive with %s as the whole drive', (_name, pathname) => {
    expect(parseUrl({ pathname })).toEqual(page({ page: 'drive', dongleId: DONGLE, logId: LOG }));
  });

  it.each([
    ['an unknown page', `/${DONGLE}/settings`],
    ['extra segments after prime', `/${DONGLE}/prime/extra`],
    ['extra segments after stream', `/${DONGLE}/stream/extra`],
    ['a half legacy range', `/${DONGLE}/10`],
  ])('reads %s as the device dashboard', (_name, pathname) => {
    expect(parseUrl({ pathname })).toEqual(page({ page: 'dashboard', dongleId: DONGLE }));
  });

  it.each([
    ['a short id', '/0000aaaa0000aaa'],
    ['a long id', `/${DONGLE}0`],
    ['an id inside a word', `/x${DONGLE}x/prime`],
    ['uppercase hex', `/${DONGLE.toUpperCase()}`],
  ])('does not read %s as a device', (_name, pathname) => {
    expect(parseUrl({ pathname }).dongleId).toBeNull();
  });

  it.each([
    ['', NO_DIALOGS],
    [`?settings=${OTHER}`, { ...NO_DIALOGS, settings: OTHER }],
    ['?settings=not-a-device', NO_DIALOGS],
    ['?add-device', { ...NO_DIALOGS, 'add-device': true }],
    ['?filter', { ...NO_DIALOGS, filter: true }],
    [`?filter&settings=${OTHER}&unknown=1`, { ...NO_DIALOGS, filter: true, settings: OTHER }],
  ])('reads dialogs from "%s"', (search, dialogs) => {
    expect(parseUrl({ pathname: `/${DONGLE}`, search }).dialogs).toEqual(dialogs);
  });
});

describe('buildUrl', () => {
  it.each([
    [{ page: 'root' }, '/'],
    [{ page: 'referrals' }, '/referrals'],
    [{ page: 'dashboard', dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'dashboard', dongleId: null }, '/'],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    // whole seconds, rounded outwards so the selection is never cut
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10999, end: 20500 } }, `/${DONGLE}/${LOG}/10/21`],
  ])('writes %j', (nav, expected) => {
    expect(buildUrl(nav)).toBe(expected);
  });

  it.each([
    '/', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}/0/20`, `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(buildUrl(parseUrl({ pathname }))).toBe(pathname);
  });
});

describe('withDialog', () => {
  it('opens a flag dialog without a value', () => {
    expect(withDialog({ pathname: `/${DONGLE}`, search: '' }, 'add-device', true)).toEqual({ pathname: `/${DONGLE}`, search: '?add-device' });
  });

  it('opens a dialog with a value next to other parameters', () => {
    expect(withDialog({ pathname: '/x', search: '?ci=1' }, 'settings', OTHER)).toEqual({ pathname: '/x', search: `?ci=1&settings=${OTHER}` });
  });

  it('closes only the named dialog', () => {
    expect(withDialog({ pathname: '/x', search: `?filter&settings=${OTHER}&ci=1` }, 'settings', null)).toEqual({ pathname: '/x', search: '?filter&ci=1' });
  });

  it('drops the question mark when nothing is left', () => {
    expect(withDialog({ pathname: '/x', search: '?filter' }, 'filter', null)).toEqual({ pathname: '/x', search: '' });
  });

  it('round-trips through parseUrl', () => {
    const location = withDialog(withDialog({ pathname: `/${DONGLE}`, search: '' }, 'settings', OTHER), 'filter', true);
    expect(parseUrl(location).dialogs).toEqual({ ...NO_DIALOGS, settings: OTHER, filter: true });
  });
});

describe('isSafeRedirect', () => {
  it.each([
    [`/${DONGLE}/${LOG}`, true],
    ['/', true],
    ['//evil.example.com', false],
    ['/\\evil.example.com', false],
    ['https://evil.example.com', false],
    ['javascript:alert(1)', false],
    ['', false],
    [null, false],
  ])('%s is safe: %s', (url, expected) => {
    expect(isSafeRedirect(url)).toBe(expected);
  });
});
