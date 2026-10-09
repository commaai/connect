import { describe, expect, it } from 'vitest';

import { isPublic, localPath, destinationFromUrl, signInUrl, urlForDestination, urlWithDialog } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('url.js', () => {
  const OTHER = '1111bbbb1111bbbb';
  const at = (page, fields = {}) => ({
    page, dongleId: null, logId: null, range: null, settings: null, uploads: null, addDevice: false, ...fields,
  });

  it.each([
    ['/', at('root')],
    ['/demo', at('root')],
    ['/referrals', at('referrals')],
    [`/${DONGLE}`, at('dashboard', { dongleId: DONGLE })],
    [`/${DONGLE}/`, at('dashboard', { dongleId: DONGLE })],
    [`/${DONGLE}/prime`, at('prime', { dongleId: DONGLE })],
    [`/${DONGLE}/stream`, at('stream', { dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, at('drive', { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/3`, at('drive', { dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/0/20`, at('drive', { dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1000/2000`, at('legacy', { dongleId: DONGLE, range: { start: 1000, end: 2000 } })],
  ])('parses %s', (pathname, expected) => {
    expect(destinationFromUrl({ pathname })).toEqual(expected);
  });

  it.each([
    '/auth',
    '/demo/x',
    '/referrals/x',
    `/x${DONGLE}x`,
    `/${DONGLE.toUpperCase()}`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/${LOG}/1.5/20`,
    `/${DONGLE}/${LOG}/10/20/30`,
    `/${DONGLE}/2000/1000`,
    `/${DONGLE}/${LOG}/0/99999999999999999999`,
  ])('does not recognise %s', (pathname) => {
    expect(destinationFromUrl({ pathname }).page).toBe('not-found');
  });

  it('reads dialogs from the query, ignoring ones that name no device', () => {
    expect(destinationFromUrl({ pathname: `/${DONGLE}`, search: `?settings=${OTHER}&uploads=${OTHER}&add-device` }))
      .toMatchObject({ settings: OTHER, uploads: OTHER, addDevice: true });
    expect(destinationFromUrl({ pathname: '/referrals', search: '?settings=nope' }).settings).toBeNull();
  });

  it.each([
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
    '/referrals',
    `/${DONGLE}/${LOG}?settings=${OTHER}`,
    `/referrals?settings=${OTHER}`,
    `/${DONGLE}?settings=${OTHER}&uploads=${OTHER}`,
    `/${DONGLE}?add-device`,
  ])('writes %s back exactly', (url) => {
    const [pathname, query] = url.split('?');
    expect(urlForDestination(destinationFromUrl({ pathname, search: query ? `?${query}` : '' }))).toBe(url);
  });

  it('rounds ranges outwards so a selection keeps its edges', () => {
    expect(urlForDestination({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10200, end: 10700 } }))
      .toBe(`/${DONGLE}/${LOG}/10/11`);
  });

  it('writes / for a page whose device is not known', () => {
    expect(urlForDestination({ page: 'dashboard', dongleId: null })).toBe('/');
    expect(urlForDestination({ page: 'root' })).toBe('/');
  });

  it('only lets signed-out visitors see shared drives', () => {
    expect(isPublic(at('drive', { dongleId: DONGLE, logId: LOG }))).toBe(true);
    expect(isPublic(at('legacy', { dongleId: DONGLE }))).toBe(true);
    expect(isPublic(at('drive', { dongleId: DONGLE, logId: LOG, settings: DONGLE }))).toBe(false);
    expect(isPublic(at('drive', { dongleId: DONGLE, logId: LOG, uploads: DONGLE }))).toBe(false);
    expect(isPublic(at('dashboard', { dongleId: DONGLE }))).toBe(false);
  });

  it.each([
    ['/a/b?c=d#e', '/a/b?c=d#e'],
    ['//example.com/', null],
    ['/\\example.com/', null],
    ['/\t/example.com/', null], // the browser drops the tab
    ['//[', null],
    ['https://example.com/', null],
    ['javascript:alert(1)', null],
    [null, null],
  ])('localPath(%s)', (url, expected) => {
    expect(localPath(url)).toBe(expected);
  });

  it('signs in and comes back to the whole URL', () => {
    expect(signInUrl(`/${DONGLE}/${LOG}?settings=${DONGLE}`))
      .toBe(`/?r=${encodeURIComponent(`/${DONGLE}/${LOG}?settings=${DONGLE}`)}`);
    expect(signInUrl('//example.com/')).toBe('/');
  });

  it('opens and closes a dialog without touching the rest of the URL', () => {
    const prime = { pathname: `/${DONGLE}/prime`, search: '?stripe_success=cs_1' };
    expect(urlWithDialog(prime, 'settings', OTHER)).toBe(`/${DONGLE}/prime?stripe_success=cs_1&settings=${OTHER}`);
    expect(urlWithDialog({ ...prime, search: `?stripe_success=cs_1&settings=${OTHER}` }, 'settings', null))
      .toBe(`/${DONGLE}/prime?stripe_success=cs_1`);
    expect(urlWithDialog({ pathname: '/', search: '?ci=' }, 'addDevice', true)).toBe('/?ci=&add-device');
  });
});
