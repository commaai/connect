import { describe, expect, it } from 'vitest';

import { parse, urlFor } from './url';

const D = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000002a--0e9d0d3d8b';

const loc = (url) => {
  const [pathname, search] = url.split('?');
  return { pathname, search: search ? `?${search}` : '' };
};
const at = (page, fields = {}) => ({ page, dongleId: null, logId: null, zoom: null, modal: null, ...fields });

describe('URL grammar', () => {
  it.each([
    ['/', at('root')],
    ['/demo', at('root')],
    ['/auth/', at('auth')],
    ['/auth/g', at('auth')],
    ['/referrals', at('referrals')],
    [`/${D}`, at('dashboard', { dongleId: D })],
    [`/${D}/`, at('dashboard', { dongleId: D })],
    [`/${D}/prime`, at('prime', { dongleId: D })],
    [`/${D}/stream`, at('stream', { dongleId: D })],
    [`/${D}/${LOG}`, at('drive', { dongleId: D, logId: LOG })],
    [`/${D}/${HEX_LOG}`, at('drive', { dongleId: D, logId: HEX_LOG })],
    [`/${D}/${LOG}/556/610`, at('drive', { dongleId: D, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${D}/${LOG}/0/20`, at('drive', { dongleId: D, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${D}/${LOG}/20/10`, at('drive', { dongleId: D, logId: LOG })],
    [`/${D}/1754481600000/1754481660000`, at('legacy', { dongleId: D, zoom: { start: 1754481600000, end: 1754481660000 } })],
    [`/${D}?modal=settings`, at('dashboard', { dongleId: D, modal: { name: 'settings', dongleId: D } })],
    [`/${D}?modal=settings&device=${OTHER}`, at('dashboard', { dongleId: D, modal: { name: 'settings', dongleId: OTHER } })],
    [`/${D}?modal=add-device`, at('dashboard', { dongleId: D, modal: { name: 'add-device', dongleId: D } })],
    [`/${D}/${LOG}?modal=uploads`, at('drive', { dongleId: D, logId: LOG, modal: { name: 'uploads', dongleId: D } })],
    [`/${D}?modal=nope`, at('dashboard', { dongleId: D })],
    [`/${D}?modal=settings&device=nope`, at('dashboard', { dongleId: D })],
    [`/${D}?pair=abc&stripe_success=1`, at('dashboard', { dongleId: D })],
    [`/${D}/prime/extra`, at('unknown')],
    [`/${D}/${LOG}/10`, at('unknown')],
    ['/xyzaaaaaaaaaaaaaaaa1', at('unknown')],
    [`/${D}0`, at('unknown')],
    ['/prime', at('unknown')],
  ])('parse(%s)', (url, expected) => {
    expect(parse(loc(url))).toEqual(expected);
  });

  it('parses a location without a search string', () => {
    expect(parse({ pathname: `/${D}/stream` })).toEqual(at('stream', { dongleId: D }));
  });

  it.each([
    '/',
    '/referrals',
    `/${D}`,
    `/${D}/prime`,
    `/${D}/stream`,
    `/${D}/${LOG}`,
    `/${D}/${HEX_LOG}`,
    `/${D}/${LOG}/556/610`,
    `/${D}/${LOG}/0/20`,
    `/${D}/1754481600000/1754481660000`,
    `/${D}?modal=settings`,
    `/${D}?modal=settings&device=${OTHER}`,
    `/${D}/${LOG}?modal=uploads`,
    `/?modal=add-device`,
  ])('urlFor round-trips %s', (url) => {
    expect(urlFor(parse(loc(url)))).toBe(url);
  });

  it('never shrinks a sub-second zoom when writing seconds', () => {
    expect(urlFor({ page: 'drive', dongleId: D, logId: LOG, zoom: { start: 1500, end: 1700 } }))
      .toBe(`/${D}/${LOG}/1/2`);
  });

  it('falls back to / for pages without a URL of their own', () => {
    expect(urlFor({ page: 'dashboard', dongleId: null })).toBe('/');
    expect(urlFor({ page: 'unknown' })).toBe('/');
  });
});
