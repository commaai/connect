import { describe, expect, it } from 'vitest';

import { buildUrl, isPublic, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const drive = { page: 'drive', dongleId: DONGLE, logId: LOG };

function parse(url) {
  const [pathname, search] = url.split('?');
  return parseUrl({ pathname, search: search ? `?${search}` : '' });
}

describe('urls', () => {
  it.each([
    ['/', { page: 'dashboard' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, drive],
    [`/${DONGLE}/${LOG}/10/20`, { ...drive, start: 10000, end: 20000 }],
    [`/${DONGLE}/${LOG}/0/20`, { ...drive, start: 0, end: 20000 }],
    [`/${DONGLE}?settings=${OTHER}`, { page: 'dashboard', dongleId: DONGLE, settings: OTHER }],
    [`/${DONGLE}/${LOG}/10/20?settings=${DONGLE}`, { ...drive, start: 10000, end: 20000, settings: DONGLE }],
    [`/referrals?settings=${DONGLE}`, { page: 'referrals', settings: DONGLE }],
  ])('%s reads and writes back the same', (url, destination) => {
    expect(parse(url)).toEqual({ settings: null, ...destination });
    expect(buildUrl(destination)).toBe(url);
  });

  it.each([
    ['an old link by time', `/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }],
    ['a backwards range', `/${DONGLE}/${LOG}/20/10`, drive],
    ['an empty range', `/${DONGLE}/${LOG}/10/10`, drive],
    ['half a range', `/${DONGLE}/${LOG}/10`, drive],
    ['a range that is not a number', `/${DONGLE}/${LOG}/ten/20`, drive],
    ['a backwards old link', `/${DONGLE}/2000/1000`, { page: 'dashboard', dongleId: DONGLE }],
    ['an unknown page', `/${DONGLE}/nothing`, { page: 'dashboard', dongleId: DONGLE }],
    ['a trailing slash', `/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    ['no device', '/not-a-device/prime', { page: 'dashboard' }],
    ['settings for no device', `/${DONGLE}?settings=nope`, { page: 'dashboard', dongleId: DONGLE }],
  ])('reads %s', (_name, url, destination) => {
    expect(parse(url)).toEqual({ settings: null, ...destination });
  });

  it('writes a range in whole seconds that is never empty', () => {
    expect(buildUrl({ ...drive, start: 10200, end: 20900 })).toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(buildUrl({ ...drive, start: 10200, end: 10900 })).toBe(`/${DONGLE}/${LOG}/10/11`);
  });

  it('only lets signed out visitors open drives', () => {
    expect(isPublic(parse(`/${DONGLE}/${LOG}`))).toBe(true);
    expect(isPublic(parse(`/${DONGLE}/1000/2000`))).toBe(true);
    expect(isPublic(parse(`/${DONGLE}`))).toBe(false);
    expect(isPublic(parse(`/${DONGLE}/prime`))).toBe(false);
    expect(isPublic(parse('/a/b/c'))).toBe(false);
  });
});
