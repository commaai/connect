import { describe, expect, it } from 'vitest';

import { parseLocation, toPath } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NEW_LOG = '0000010a--a51155e496';

describe('URL grammar', () => {
  it.each([
    ['/', {}],
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/settings`, { dongleId: DONGLE, page: 'settings' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${NEW_LOG}`, { dongleId: DONGLE, routeId: NEW_LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, routeId: LOG, start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, routeId: LOG, start: 0, end: 20000 }],
  ])('%s round-trips', (pathname, location) => {
    expect(parseLocation(pathname)).toEqual(location);
    expect(toPath(location)).toBe(pathname);
    expect(parseLocation(toPath(location))).toEqual(location);
  });

  it.each([
    ['trailing slash', `/${DONGLE}/`, { dongleId: DONGLE }],
    ['empty segments', `//${DONGLE}//${LOG}//`, { dongleId: DONGLE, routeId: LOG }],
    ['no device', '/referrals', {}],
    ['uppercase dongle id', `/${DONGLE.toUpperCase()}`, {}],
    ['a dongle id with extra characters', `/${DONGLE}0`, {}],
    ['a route id with extra characters', `/${DONGLE}/${LOG}0`, { dongleId: DONGLE }],
    ['an unknown page', `/${DONGLE}/junk`, { dongleId: DONGLE }],
    ['junk after a page', `/${DONGLE}/prime/extra`, { dongleId: DONGLE, page: 'prime' }],
    ['a partial range', `/${DONGLE}/${LOG}/10`, { dongleId: DONGLE, routeId: LOG }],
    ['a reversed range', `/${DONGLE}/${LOG}/20/10`, { dongleId: DONGLE, routeId: LOG }],
    ['a fractional range', `/${DONGLE}/${LOG}/1.5/20`, { dongleId: DONGLE, routeId: LOG }],
    ['a legacy timestamp range', `/${DONGLE}/1754481600000/1754481660000`, {
      dongleId: DONGLE, legacyRange: { start: 1754481600000, end: 1754481660000 },
    }],
  ])('parses %s', (_name, pathname, location) => {
    expect(parseLocation(pathname)).toEqual(location);
  });

  it('rounds a range outwards to whole seconds', () => {
    expect(toPath({ dongleId: DONGLE, routeId: LOG, start: 12345, end: 42001 })).toBe(`/${DONGLE}/${LOG}/12/43`);
  });

  it('needs a device for every path but the root', () => {
    expect(toPath({ page: 'prime' })).toBe('/');
  });
});
