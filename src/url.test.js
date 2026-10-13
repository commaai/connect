import { describe, expect, it } from 'vitest';

import { parse, toUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('url grammar', () => {
  const D2 = '1111bbbb1111bbbb';
  const location = (url) => {
    const [pathname, query] = url.split('?');
    return { pathname, search: query === undefined ? '' : `?${query}` };
  };
  const dest = (fields) => ({
    view: 'dashboard', dongleId: null, log: null, start: null, end: null, settings: null, uploads: false, ...fields,
  });
  const drive = dest({ view: 'drive', dongleId: DONGLE, log: LOG });

  it.each([
    ['/', dest({})],
    ['/referrals', dest({ view: 'referrals' })],
    [`/${DONGLE}`, dest({ dongleId: DONGLE })],
    [`/${DONGLE}/prime`, dest({ view: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, dest({ view: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, drive],
    [`/${DONGLE}/${LOG}/10/20`, { ...drive, start: 10000, end: 20000 }],
    [`/${DONGLE}/${LOG}/0/20`, { ...drive, start: 0, end: 20000 }],
    [`/${DONGLE}/1000/2000`, dest({ view: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 })],
    [`/${DONGLE}/${LOG}?settings=${D2}&uploads`, { ...drive, settings: D2, uploads: true }],
    [`/${DONGLE}?uploads`, dest({ dongleId: DONGLE, uploads: true })],
  ])('round trips %s', (url, expected) => {
    expect(parse(location(url))).toEqual(expected);
    expect(toUrl(expected)).toBe(url);
  });

  it.each([
    [`/${DONGLE}/`, dest({ dongleId: DONGLE })],
    ['/demo', dest({})],
  ])('parses alias %s', (url, expected) => {
    expect(parse(location(url))).toEqual(expected);
  });

  it('rounds zoom outwards', () => {
    expect(toUrl({ ...drive, start: 10500, end: 20300 })).toBe(`/${DONGLE}/${LOG}/10/21`);
  });

  it('keeps start=0 and omits zoom for a whole drive', () => {
    expect(toUrl(drive)).toBe(`/${DONGLE}/${LOG}`);
    expect(toUrl({ ...drive, start: 0, end: 20000 })).toBe(`/${DONGLE}/${LOG}/0/20`);
  });

  it.each([
    '/x/prime',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/${LOG}/1.5/2`,
    `/${DONGLE}/10`,
    `/${DONGLE}/0/20/ignored`,
    '/auth/code/provider',
    '/referrals/x',
  ])('rejects %s', (url) => {
    expect(parse(location(url))).toBeNull();
  });

  it('drops a bogus settings overlay', () => {
    expect(parse(location(`/${DONGLE}?settings=bogus`))).toEqual(dest({ dongleId: DONGLE }));
  });
});
