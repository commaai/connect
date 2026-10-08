import { describe, expect, it } from 'vitest';

import { PAGES, pageAt, parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URLs', () => {
  const examples = {
    root: ['/', {}],
    referrals: ['/referrals', {}],
    device: [`/${DONGLE}`, { dongleId: DONGLE }],
    settings: [`/${DONGLE}/settings`, { dongleId: DONGLE }],
    prime: [`/${DONGLE}/prime`, { dongleId: DONGLE }],
    stream: [`/${DONGLE}/stream`, { dongleId: DONGLE }],
    drive: [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }],
    timeRange: [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, startTime: 1000, endTime: 2000 }],
  };

  it('has an example for every page', () => {
    expect(Object.keys(examples)).toEqual(Object.keys(PAGES));
  });

  it.each(Object.entries(examples))('reads and writes %s the same way', (page, [pathname, params]) => {
    expect(parseUrl(pathname)).toEqual({ page, ...params });
    expect(urlFor(page, params)).toBe(pathname);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, {}],
    [`/${DONGLE}/${LOG}/0/20`, { zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/10`, {}],
  ])('reads drive %s', (pathname, zoom) => {
    expect(parseUrl(pathname)).toEqual({ page: 'drive', dongleId: DONGLE, logId: LOG, ...zoom });
  });

  it('writes a zoom in whole seconds', () => {
    const zoom = { start: 10999, end: 20500 };
    expect(urlFor('drive', { dongleId: DONGLE, logId: LOG, zoom })).toBe(`/${DONGLE}/${LOG}/10/20`);
  });

  it.each([
    '/not-a-device', '/not-a-device/prime', `/${DONGLE}/prime/extra`, `/${DONGLE}/${LOG}/10/20/30`, '/demo',
  ])('has no page at %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ page: null });
  });

  it('accepts a trailing slash', () => {
    expect(parseUrl(`/${DONGLE}/prime/`).page).toBe('prime');
  });

  it('refuses to write a URL the app could not read back', () => {
    expect(() => urlFor('device', {})).toThrow('Expected "dongleId" to be defined');
    expect(() => urlFor('device', { dongleId: 'not-a-device' })).toThrow('Expected "dongleId" to match');
  });

  it('shows a modal over the page it was opened from', () => {
    const drive = `/${DONGLE}/${LOG}`;
    expect(pageAt({ pathname: `/${DONGLE}/settings`, state: { background: drive } })).toEqual(parseUrl(drive));
    expect(pageAt({ pathname: `/${DONGLE}/settings` }).dongleId).toBe(DONGLE);
  });
});
