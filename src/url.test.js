import { describe, expect, it } from 'vitest';

import { parseLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';

const page = (fields) => ({ page: 'home', dongleId: null, logId: null, range: null, settingsDongleId: null, ...fields });

describe('parseLocation', () => {
  it.each([
    ['/', page({})],
    ['/referrals', page({ page: 'referrals' })],
    ['/auth/', page({ page: 'auth' })],
    [`/${DONGLE}`, page({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, page({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, page({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${HEX_LOG}`, page({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG })],
    [`/${DONGLE}/${HEX_LOG}/0/20`, page({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/1772040630000/1772041555000`, page({ page: 'legacy', dongleId: DONGLE, range: { start: 1772040630000, end: 1772041555000 } })],
  ])('%s', (pathname, expected) => {
    expect(parseLocation({ pathname, search: '' })).toEqual(expected);
  });
});

describe('urlFor', () => {
  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${HEX_LOG}`,
    `/${DONGLE}/${HEX_LOG}/0/20`,
    `/${DONGLE}/${LOG}/556/610`,
  ])('round-trips %s', (pathname) => {
    expect(urlFor(parseLocation({ pathname, search: '' }))).toBe(pathname);
  });

  it.each([
    ['/demo', '/'],
    ['/AAAAAAAAAAAAAAAA', '/'],
    [`/${DONGLE}/`, `/${DONGLE}`],
    [`/${DONGLE}/nonsense/path`, `/${DONGLE}`],
    [`/${DONGLE}/prime/extra`, `/${DONGLE}/prime`],
    [`/${DONGLE}/${HEX_LOG}/20/10`, `/${DONGLE}/${HEX_LOG}`],
    [`/${DONGLE}/${HEX_LOG}/abc/def`, `/${DONGLE}/${HEX_LOG}`],
    [`/${DONGLE}/${HEX_LOG}/1.5/20`, `/${DONGLE}/${HEX_LOG}`],
  ])('canonicalizes %s to %s', (pathname, canonical) => {
    expect(urlFor(parseLocation({ pathname, search: '' }))).toBe(canonical);
  });

  it.each([
    [{ start: 1500, end: 20700 }, `/${DONGLE}/${HEX_LOG}/1/20`],
    [{ start: 10300, end: 10700 }, `/${DONGLE}/${HEX_LOG}/10/11`],
  ])('rounds the drive range %j down to whole seconds, keeping at least one', (range, expected) => {
    expect(urlFor({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG, range })).toBe(expected);
  });

  it.each([
    [`?settings=${DONGLE}`, DONGLE],
    ['?settings=not-a-dongle', null],
    [`?stripe_success=1&settings=${DONGLE}`, DONGLE],
  ])('reads the settings overlay from %s', (search, expected) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search }).settingsDongleId).toBe(expected);
  });
});
