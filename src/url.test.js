import { describe, expect, it } from 'vitest';
import * as url from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('navigation URLs', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/demo', { page: 'home' }],
    ['/referrals', { page: 'referrals' }],
    ['/auth/', { page: 'auth' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, routeId: LOG, range: null }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', range: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/0.125/20.999`, { page: 'drive', range: { start: 125, end: 20999 } }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', range: { start: 1000, end: 2000 } }],
  ])('parses %s', (pathname, expected) => {
    expect(url.parseLocation({ pathname })).toMatchObject(expected);
  });

  it.each([
    `/prefix${DONGLE}`, `/${DONGLE}/prime/extra`, `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/0/20/extra`, `/${DONGLE}/${LOG}/-1/20`,
    `/${DONGLE}/${LOG}/10/10`, `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/0/Infinity`, `/${DONGLE}/${LOG}/0/9007199254740992`,
    `/${DONGLE}/${LOG}/0/1e2`, `/${DONGLE}/${LOG}/0/1.0001`,
    '//example.com', '/\\example.com',
  ])('rejects malformed path %s', (pathname) => {
    expect(url.parseLocation({ pathname })).toMatchObject({ page: 'unknown', dongleId: null, routeId: null });
  });

  it('opens settings for another device without changing the background drive', () => {
    expect(url.parseLocation({ pathname: `/${DONGLE}/${LOG}/0/20`, search: '?dialog=settings&device=1111bbbb1111bbbb' }))
      .toMatchObject({ page: 'drive', routeId: LOG, dialog: 'settings', dialogDeviceId: '1111bbbb1111bbbb' });
  });

  it('ignores unknown dialogs and invalid target devices', () => {
    expect(url.parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=surprise' }).dialog).toBeNull();
    expect(url.parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=settings&device=invalid' }).dialog).toBeNull();
  });

  it('preserves query arguments and fragments when opening and closing a dialog', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/0.125/20.999`, search: '?ci=1&stripe_return=ok', hash: '#position' };
    const destination = { page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 125, end: 20999 }, dialog: 'settings' };
    expect(url.buildLocation(destination, location)).toEqual({
      pathname: location.pathname, search: '?ci=1&stripe_return=ok&dialog=settings', hash: '#position',
    });
    expect(url.buildLocation({ ...destination, dialog: null }, { ...location, search: '?ci=1&dialog=settings&device=1111bbbb1111bbbb' }))
      .toEqual({ pathname: location.pathname, search: '?ci=1', hash: '#position' });
  });

  it.each([
    { page: 'dashboard', dongleId: DONGLE },
    { page: 'prime', dongleId: DONGLE },
    { page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 0, end: 20000 } },
    { page: 'drive', dongleId: DONGLE, routeId: LOG, range: { start: 125, end: 20999 }, dialog: 'uploads' },
  ])('round-trips a destination %j', (destination) => {
    expect(url.parseLocation(url.buildLocation(destination))).toMatchObject(destination);
  });
});


describe('redirect targets', () => {
  it.each(['https://example.com', '//example.com', '/\\example.com', '/auth/', '/?r=/', '/missing'])('rejects unsafe or recursive redirect %s', value => {
    expect(url.parseRedirect(value)).toBeNull();
  });
  it('keeps an internal destination with its dialog and fragment', () => {
    const value = `/${DONGLE}/${LOG}?dialog=files#position`;
    expect(url.parseRedirect(value)).toBe(value);
  });
});
