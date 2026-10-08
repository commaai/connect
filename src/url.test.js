import { describe, expect, it } from 'vitest';
import { deviceUrl, driveUrl, parseLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const parse = (url) => parseLocation(new URL(url, 'https://connect.comma.ai'));

describe('navigation URLs', () => {
  it.each([
    ['/', 'dashboard', null],
    ['/referrals', 'referrals', null],
    ['/auth/', 'auth', null],
    ['/demo', 'demo', null],
    ['/deadbeefdeadbeef', 'dashboard', 'deadbeefdeadbeef'],
    ['/deadbeefdeadbeef/00000000--0000000001', 'drive', 'deadbeefdeadbeef'],
    [`/${DONGLE}`, 'dashboard', DONGLE],
    [`/${DONGLE}/`, 'dashboard', DONGLE],
    [`/${DONGLE}/prime`, 'prime', DONGLE],
    [`/${DONGLE}/stream`, 'stream', DONGLE],
    [`/${DONGLE}/${LOG}`, 'drive', DONGLE],
    [`/${DONGLE}/0000010a--a51155e496`, 'drive', DONGLE],
    [`/${DONGLE}/1000/2000`, 'legacy', DONGLE],
  ])('parses %s', (url, page, dongleId) => {
    expect(parse(url)).toMatchObject({ page, dongleId });
  });

  it.each([
    '/unknown', '/not-a-device/prime', `/x${DONGLE}`, `/${DONGLE}x`,
    `/${DONGLE}/prime/extra`, `/${DONGLE}/stream/extra`, `/${DONGLE}/unknown`,
    `/${DONGLE}/${LOG}extra`, `/${DONGLE}/100/NaN`, `/${DONGLE}/200/100`,
  ])('falls back predictably for invalid path %s', (url) => {
    expect(parse(url)).toMatchObject({ page: 'dashboard', routeId: null, range: null, legacyRange: null });
  });

  it.each(['10', 'NaN/20', '10/Infinity', '-1/20', '20/10', '10/10', '1e2/200', '0x10/20', '1/9007199254740992'])('ignores invalid drive range %s', (range) => {
    expect(parse(`/${DONGLE}/${LOG}/${range}`)).toMatchObject({ page: 'drive', routeId: LOG, range: null });
  });

  it.each([{ start: 0, end: 20000 }, { start: 123, end: 1234 }, { start: 1001, end: 1013 }, { start: 10000, end: 20000 }])('round trips drive range %j', (range) => {
    const url = driveUrl(DONGLE, LOG, range);
    expect(parse(url)).toMatchObject({ page: 'drive', routeId: LOG, range });
  });

  it('serializes whole drives and device destinations', () => {
    expect(driveUrl(DONGLE, LOG)).toBe(`/${DONGLE}/${LOG}`);
    expect(driveUrl(DONGLE, null)).toBe(deviceUrl(DONGLE));
    expect(deviceUrl(null)).toBe('/');
  });

  it('keeps legacy absolute milliseconds distinct from relative seconds', () => {
    expect(parse(`/${DONGLE}/1000/2000`)).toMatchObject({ legacyRange: { start: 1000, end: 2000 }, range: null });
    expect(parse(`/${DONGLE}/${LOG}/0/20`)).toMatchObject({ legacyRange: null, range: { start: 0, end: 20000 } });
  });

});
