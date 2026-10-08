import { describe, expect, it } from 'vitest';

import { buildPath, parseLocation, selectRoute } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const route = (fields) => ({ dongleId: null, logId: null, range: null, settings: null, ...fields });

describe('parseLocation', () => {
  it.each([
    ['/', route({ view: 'dashboard' })],
    ['/referrals', route({ view: 'referrals' })],
    [`/${DONGLE}`, route({ view: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, route({ view: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, route({ view: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, route({ view: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, route({ view: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/0/20`, route({ view: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1000/2000`, route({ view: 'legacyRange', dongleId: DONGLE, range: { start: 1000, end: 2000 } })],
  ])('%s', (pathname, expected) => {
    expect(parseLocation({ pathname })).toEqual(expected);
  });

  it.each([
    ['/demo', null],
    ['/auth/code', null],
    [`/${DONGLE}/prime/extra`, DONGLE],
    [`/${DONGLE}/${LOG}/10`, DONGLE],
    [`/${DONGLE}/${LOG}/ten/20`, DONGLE],
    [`/x${DONGLE}`, null],
  ])('falls back to the dashboard for unknown path %s', (pathname, dongleId) => {
    expect(parseLocation({ pathname })).toEqual(route({ view: 'dashboard', dongleId }));
  });

  it.each([
    [`?settings=${OTHER}`, OTHER],
    [`?settings=${OTHER}&pair=x`, OTHER],
    ['?settings=nope', null],
    ['?settings=', null],
    ['', null],
  ])('reads the settings modal from %j', (search, settings) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search }).settings).toBe(settings);
  });
});

describe('buildPath', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/1000/2000`,
    `/${DONGLE}?settings=${OTHER}`,
    `/referrals?settings=${OTHER}`,
    `/${DONGLE}/${LOG}/10/20?settings=${DONGLE}`,
  ])('round-trips %s', (url) => {
    const [pathname, search] = url.split('?');
    expect(buildPath(parseLocation({ pathname, search: search ? `?${search}` : '' }))).toBe(url);
  });

  it('writes drive ranges in whole seconds without collapsing them', () => {
    const drive = { view: 'drive', dongleId: DONGLE, logId: LOG };
    expect(buildPath({ ...drive, range: { start: 10999, end: 20500 } })).toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(buildPath({ ...drive, range: { start: 10100, end: 10900 } })).toBe(`/${DONGLE}/${LOG}/10/11`);
  });

  it('ignores fields the view does not use', () => {
    expect(buildPath({ view: 'prime', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 1 } })).toBe(`/${DONGLE}/prime`);
    expect(buildPath({ view: 'referrals', dongleId: DONGLE })).toBe('/referrals');
  });

  it('rejects a route that cannot be addressed', () => {
    expect(() => buildPath({ view: 'prime', dongleId: null })).toThrow('incomplete prime route');
  });
});

describe('selectRoute', () => {
  it('returns the same route until the location changes', () => {
    const location = { pathname: `/${DONGLE}/prime`, search: '' };
    const first = selectRoute({ router: { location } });
    expect(selectRoute({ router: { location } })).toBe(first);
    expect(selectRoute({ router: { location: { ...location } } })).not.toBe(first);
    expect(first.view).toBe('prime');
  });
});
