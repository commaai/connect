import { describe, expect, it } from 'vitest';

import { parseLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const parse = (url) => {
  const [pathname, search = ''] = url.split('?');
  return parseLocation({ pathname, search: search && `?${search}` });
};

describe('url', () => {
  it.each([
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}?modal=settings`, { page: 'dashboard', dongleId: DONGLE, modal: 'settings' }],
  ])('round-trips %s', (url, view) => {
    expect(parse(url)).toEqual({ modal: null, ...view });
    expect(urlFor(parse(url))).toBe(url);
  });

  it.each([
    ['/', { page: 'dashboard' }],
    ['/demo', { page: 'dashboard' }],
    ['/auth/code/provider', { page: 'dashboard' }],
    [`/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime/extra`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}/20/10`, { page: 'drive', dongleId: DONGLE, logId: LOG, zoom: null }],
    [`/${DONGLE}/1000/2000`, { page: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }],
    [`/${DONGLE}/1000/2000/3000`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}?modal=constructor`, { page: 'dashboard', dongleId: DONGLE }],
  ])('parses %s', (url, view) => {
    expect(parse(url)).toEqual({ modal: null, ...view });
  });

  it('rounds a zoom outward to whole seconds', () => {
    expect(urlFor({ dongleId: DONGLE, logId: LOG, zoom: { start: 1500, end: 2100 } })).toBe(`/${DONGLE}/${LOG}/1/3`);
  });

  it('falls back to / without a device', () => {
    expect(urlFor({ dongleId: null })).toBe('/');
    expect(urlFor({ dongleId: null, modal: 'pair' })).toBe('/?modal=pair');
  });
});
