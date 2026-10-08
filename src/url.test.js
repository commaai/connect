import { describe, expect, it } from 'vitest';

import { NOWHERE, formatUrl, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';
const OTHER_DONGLE = '1111bbbb1111bbbb';

const at = (url) => {
  const { pathname, search } = new URL(url, 'https://connect.comma.ai');
  return { pathname, search };
};

describe('parseUrl and formatUrl', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${HEX_LOG}`, { page: 'drive', dongleId: DONGLE, logId: HEX_LOG }],
    [`/${DONGLE}/${HEX_LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: HEX_LOG, start: 0, end: 20000 }],
    [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, start: 556000, end: 610000 }],
    [`/${DONGLE}/1700000000000/1700000060000`, { page: 'legacy', dongleId: DONGLE, startMs: 1700000000000, endMs: 1700000060000 }],
    [`/${DONGLE}?dialog=settings`, { page: 'dashboard', dongleId: DONGLE, dialog: 'settings' }],
    [`/${DONGLE}/${HEX_LOG}?dialog=uploads&device=${OTHER_DONGLE}`, {
      page: 'drive', dongleId: DONGLE, logId: HEX_LOG, dialog: 'uploads', device: OTHER_DONGLE,
    }],
  ])('%s reads and writes the same place', (url, fields) => {
    const place = parseUrl(at(url));
    expect(place).toEqual({ ...NOWHERE, ...fields });
    expect(formatUrl(place)).toBe(url);
  });

  it.each([
    '/demo',
    '/auth/',
    `/${DONGLE}/settings`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE.toUpperCase()}`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}x`,
    `/${DONGLE}/${LOG}/1.5/2`,
  ])('%s is not a page', (url) => {
    expect(parseUrl(at(url))).toEqual({ ...NOWHERE, page: 'not-found' });
  });

  it('reads a trailing slash as the same page', () => {
    expect(parseUrl(at(`/${DONGLE}/${LOG}/`))).toEqual(parseUrl(at(`/${DONGLE}/${LOG}`)));
  });

  it('widens a zoom shorter than a second to whole seconds', () => {
    const place = { ...NOWHERE, page: 'drive', dongleId: DONGLE, logId: LOG, start: 10200, end: 10800 };
    expect(formatUrl(place)).toBe(`/${DONGLE}/${LOG}/10/11`);
  });

  it('writes a place without its device as home', () => {
    expect(formatUrl({ ...NOWHERE, page: 'dashboard' })).toBe('/');
  });
});
