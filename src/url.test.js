import { describe, expect, it } from 'vitest';
import { parseUrl, serializeUrl } from './routing/routes';
const D = '0000aaaa0000aaaa';
const R = '2026-08-06--12-00-00';
describe('URL contract', () => {
  it.each([
    ['/', 'dashboard'], [`/${D}`, 'dashboard'], [`/${D}/drive/${R}`, 'drive'],
    [`/${D}/prime`, 'prime'], [`/${D}/stream`, 'stream'], ['/referrals', 'referrals'], ['/demo', 'demo'], ['/auth/callback', 'auth'],
  ])('parses %s', (url, page) => expect(parseUrl(url).page).toBe(page));
  it.each(['settings', 'add-device', 'pair', 'clip', 'uploads'])('round trips %s over a drive', dialog => {
    const route = parseUrl(`/${D}/drive/${R}/0/20?dialog=${dialog}`);
    expect(route.dialog).toBe(dialog);
    expect(parseUrl(serializeUrl(route))).toEqual(route);
  });
  it.each([`/${D}/drive/${R}/NaN/20`, `/${D}/drive/${R}/20/10`, `/${D}/drive/${R}/0/Infinity`, `/${D}/prime/extra`, `/x${D}`, `/${D}/garbage`, `/${D}/0/20/extra`])('rejects malformed %s', url => expect(parseUrl(url).page).toBe('not-found'));
  it('keeps legacy drive links and timestamp lookups unambiguous', () => {
    expect(parseUrl(`/${D}/${R}/0/20`)).toMatchObject({ page: 'drive', range: { start: 0, end: 20000 }, legacyRange: null });
    expect(parseUrl(`/${D}/1000/2000`).legacyRange).toEqual({ start: 1000, end: 2000 });
  });
  it('opens the device clip library from the dashboard', () => {
    expect(parseUrl('/' + D + '?dialog=clips').dialog).toBe('clips');
  });
  it('accepts standalone settings and pairing aliases', () => {
    expect(parseUrl(`/${D}/settings`).dialog).toBe('settings');
    expect(parseUrl('/devices/add').dialog).toBe('add-device');
    expect(parseUrl('/devices/pair').dialog).toBe('pair');
  });
});
