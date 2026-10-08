import { describe, expect, it } from 'vitest';

import {
  anonymizeUrl, buildUrl, canonicalUrl, dialogUrl,
  normalizeInternalUrl, parseLocation, parseUrl, selectUrl,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER_DONGLE = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

describe('URL grammar', () => {
  const routes = [
    ['/', { page: 'home' }],
    ['/demo', { page: 'demo' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/0/20`, {
      page: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000,
    }],
    [`/${DONGLE}/${LOG}/0.125/0.875`, {
      page: 'drive', dongleId: DONGLE, logId: LOG, start: 125, end: 875,
    }],
    [`/${DONGLE}/${LOG}/9007199254740.99/9007199254740.991`, {
      page: 'drive', dongleId: DONGLE, logId: LOG,
      start: Number.MAX_SAFE_INTEGER - 1, end: Number.MAX_SAFE_INTEGER,
    }],
    [`/${DONGLE}/1000/2000`, {
      page: 'legacy', dongleId: DONGLE, from: 1000, to: 2000,
    }],
  ];

  it.each(routes)('parses %s', (pathname, destination) => {
    expect(parseUrl(pathname)).toEqual(destination);
  });

  it.each(routes)('builds %s', (pathname, destination) => {
    expect(buildUrl(destination)).toBe(pathname);
  });

  it.each([
    '/not-a-device',
    '/DEMO',
    `/${DONGLE.toUpperCase()}`,
    `/${DONGLE}suffix`,
    `/${DONGLE}/${LOG}suffix`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/10/nope`,
    `/${DONGLE}/${LOG}/1./2`,
    `/${DONGLE}/${LOG}/1e2/200`,
    `/${DONGLE}/${LOG}/0.0001/2`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/${LOG}/99999999999999999999/999999999999999999999`,
    `/${DONGLE}/settings/extra`,
    `/${DONGLE}/2000/1000`,
    `/${DONGLE}/10/20/extra`,
  ])('rejects %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ page: 'not-found' });
  });

  it.each([
    [null, 'A URL destination is required'],
    [{ page: 'unknown' }, 'Unknown URL page'],
    [{ page: 'constructor' }, 'Unknown URL page'],
    [{ page: 'dashboard' }, 'dongleId'],
    [{ page: 'dashboard', dongleId: DONGLE.toUpperCase() }, 'Invalid URL destination'],
    [{ page: 'drive', dongleId: DONGLE, logId: 'AAAAAAAAAA--AAAAAAAA' }, 'Invalid URL destination'],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, start: 1000 }, 'both start and end'],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, start: 2000, end: 1000 }, 'Invalid URL range'],
  ])('rejects invalid destinations', (destination, message) => {
    expect(() => buildUrl(destination)).toThrow(message);
  });

  it.each([
    ['/', '/'],
    ['/referrals', '/referrals'],
    [`/${DONGLE}`, '/<dongleId>'],
    [`/${DONGLE}/${LOG}`, '/<dongleId>/<logId>'],
    [`/${DONGLE}/${LOG}/10/20`, '/<dongleId>/<logId>/<start>/<end>'],
    [`/${DONGLE}/1000/2000`, '/<dongleId>/<from>/<to>'],
    ['/unknown/private-value', '/not-found'],
  ])('anonymizes %s', (pathname, expected) => {
    expect(anonymizeUrl(pathname)).toBe(expected);
  });

  it.each([
    [{ pathname: '/' }, '/'],
    [{ pathname: `/${DONGLE}`, search: '?keep=yes' }, `/${DONGLE}?keep=yes`],
    [
      { pathname: `/${DONGLE}`, search: '?keep=yes', hash: '#position' },
      `/${DONGLE}?keep=yes#position`,
    ],
  ])('preserves a complete canonical location', (location, expected) => {
    expect(canonicalUrl(location)).toBe(expected);
  });
});

describe('dialog grammar', () => {
  it.each([
    ['settings', `/${DONGLE}`, '?dialog=settings', DONGLE],
    ['settings', '/demo', `?dialog=settings&device=${DONGLE}`, DONGLE],
    ['settings-uploads', '/referrals', `?dialog=settings-uploads&device=${DONGLE}`, DONGLE],
    ['add-device', '/', '?dialog=add-device', null],
    ['add-device', '/demo', '?dialog=add-device', null],
    ['add-device', '/unknown', '?dialog=add-device', null],
    ['filter', `/${DONGLE}`, '?dialog=filter', null],
    ['filter', `/${DONGLE}/1000/2000`, '?dialog=filter', null],
    ['uploads', `/${DONGLE}/${LOG}`, '?dialog=uploads', null],
  ])('parses %s on its allowed page', (dialog, pathname, search, dialogDongleId) => {
    expect(parseLocation({ pathname, search })).toMatchObject({ dialog, dialogDongleId });
  });

  it.each([
    [`/${DONGLE}/${LOG}`, '?dialog=filter'],
    [`/${DONGLE}`, '?dialog=uploads'],
    [`/${DONGLE}`, '?dialog=settings&device=invalid'],
    [`/${DONGLE}`, '?dialog=settings&dialog=filter'],
    [`/${DONGLE}`, `?dialog=settings&device=${DONGLE}&device=${OTHER_DONGLE}`],
    [`/${DONGLE}`, '?dialog=unknown'],
    [`/${DONGLE}`, '?dialog=toString'],
    [`/${DONGLE}`, '?dialog=constructor'],
    [`/${DONGLE}`, `?dialog=settings&device=${DONGLE}%2F`],
    [`/${DONGLE}`, '?dialog=filter&device=0000aaaa0000aaaa'],
  ])('ignores invalid dialog %s%s', (pathname, search) => {
    expect(parseLocation({ pathname, search })).toMatchObject({
      dialog: null,
      dialogDongleId: null,
    });
  });

  it('opens and closes dialogs without disturbing unrelated URL state', () => {
    const location = { pathname: `/${DONGLE}/${LOG}`, search: '?keep=yes', hash: '#position' };
    const open = dialogUrl(location, 'settings', { device: OTHER_DONGLE });
    expect(open).toBe(`/${DONGLE}/${LOG}?keep=yes&dialog=settings&device=${OTHER_DONGLE}#position`);
    expect(dialogUrl({ ...location, search: `?keep=yes&dialog=settings&device=${OTHER_DONGLE}` }, null))
      .toBe(`/${DONGLE}/${LOG}?keep=yes#position`);
  });

  it('omits a device parameter already expressed by the path', () => {
    expect(dialogUrl(
      { pathname: `/${DONGLE}`, search: '' },
      'settings',
      { device: DONGLE },
    )).toBe(`/${DONGLE}?dialog=settings`);
  });

  it('fails fast when a dialog cannot be represented by the current page', () => {
    expect(() => dialogUrl({ pathname: `/${DONGLE}` }, 'uploads'))
      .toThrow('Dialog uploads is not valid on page dashboard');
    expect(() => dialogUrl({ pathname: '/referrals' }, 'settings'))
      .toThrow('Invalid dialog parameter: device');
  });

  it.each([
    [
      { pathname: `/${DONGLE}/${LOG}/1.000/2.000`, search: '?keep=yes', hash: '#position' },
      `/${DONGLE}/${LOG}/1/2?keep=yes#position`,
    ],
    [
      { pathname: `/${DONGLE}`, search: `?dialog=settings&device=${DONGLE}` },
      `/${DONGLE}?dialog=settings`,
    ],
    [
      { pathname: `/${DONGLE}`, search: '?keep=yes&dialog=uploads&device=bad', hash: '#position' },
      `/${DONGLE}?keep=yes#position`,
    ],
    [
      { pathname: '/unknown', search: '?dialog=settings&keep=yes' },
      '/unknown?keep=yes',
    ],
    [
      { pathname: `/${DONGLE}`, search: '?note=a%20b&flag', hash: '#position' },
      `/${DONGLE}?note=a%20b&flag#position`,
    ],
  ])('canonicalizes URL state', (location, expected) => {
    expect(canonicalUrl(location)).toBe(expected);
  });

  it('selects search-only dialog changes from router state', () => {
    const state = { router: { location: { pathname: `/${DONGLE}`, search: '' } } };
    expect(selectUrl(state).dialog).toBeNull();
    state.router.location = { ...state.router.location, search: '?dialog=settings' };
    expect(selectUrl(state)).toMatchObject({ dialog: 'settings', dialogDongleId: DONGLE });
  });
});

describe('internal redirects', () => {
  const origin = 'https://connect.comma.ai';

  it('keeps path, query, and hash for a local URL', () => {
    expect(normalizeInternalUrl(`/${DONGLE}?keep=yes#position`, origin))
      .toBe(`/${DONGLE}?keep=yes#position`);
  });

  it.each([
    'https://example.com/path',
    '//example.com/path',
    'dashboard',
    '/auth',
    '/auth/',
    '/auth/callback',
    '/?pair=secret',
    '/?r=%2Fdemo',
    `/${DONGLE}/prime?stripe_success=secret`,
    `/${DONGLE}/prime?stripe_cancelled=secret`,
  ])('rejects unsafe redirect %s', (target) => {
    expect(normalizeInternalUrl(target, origin)).toBeNull();
  });
});
