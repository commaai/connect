import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('url.js', () => {
  const at = (page, fields = {}) => ({ page, dongleId: null, logId: null, range: null, ...fields });

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

  it.each([
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
    '/referrals',
  ])('writes %s back exactly', (pathname) => {
    expect(urlForDestination(destinationFromUrl({ pathname }))).toBe(pathname);
  });

  it('rounds ranges outwards so a selection keeps its edges', () => {
    expect(urlForDestination({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10200, end: 10700 } }))
      .toBe(`/${DONGLE}/${LOG}/10/11`);
  });

  it('writes / for a page whose device is not known', () => {
    expect(urlForDestination({ page: 'dashboard', dongleId: null })).toBe('/');
    expect(urlForDestination({ page: 'root' })).toBe('/');
  });
});
