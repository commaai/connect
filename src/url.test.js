import { describe, expect, it } from 'vitest';

import { parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NONE = { dongleId: null, page: null, logId: null, zoom: null, legacyZoom: null, settings: false };

describe('parseUrl', () => {
  it.each([
    ['/', NONE],
    ['/referrals', { ...NONE, page: 'referrals' }],
    [`/${DONGLE}`, { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}/`, { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { ...NONE, dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { ...NONE, dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { ...NONE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { ...NONE, dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 } }],
  ])('parses %s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}`, '?settings', { ...NONE, dongleId: DONGLE, settings: true }],
    [`/${DONGLE}/${LOG}/10/20`, '?settings', { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 }, settings: true }],
    [`/${DONGLE}`, '?ci=1', { ...NONE, dongleId: DONGLE }],
    ['/referrals', '?settings', { ...NONE, page: 'referrals', settings: true }],
  ])('parses %s%s', (pathname, search, expected) => {
    expect(parseUrl(pathname, search)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}/20/10`, 'a reversed range'],
    [`/${DONGLE}/${LOG}/20/20`, 'an empty range'],
    [`/${DONGLE}/${LOG}/-10/20`, 'a negative start'],
    [`/${DONGLE}/${LOG}/1e3/2000`, 'an exponent'],
    [`/${DONGLE}/${LOG}/NaN/20`, 'NaN'],
    [`/${DONGLE}/${LOG}/10`, 'a missing end'],
    [`/${DONGLE}/${LOG}/1/${'9'.repeat(400)}`, 'an end too long to be a number'],
    [`/${DONGLE}/${LOG}/1/9007199254740992`, 'an end past the safe integers in milliseconds'],
  ])('opens the whole drive for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ ...NONE, dongleId: DONGLE, logId: LOG });
  });

  it('keeps the largest safe legacy range', () => {
    expect(parseUrl(`/${DONGLE}/1/9007199254740991`).legacyZoom).toEqual({ start: 1, end: 9007199254740991 });
  });

  it.each([
    [`/x${DONGLE}`], [`/${DONGLE}0`], [`/${DONGLE.toUpperCase()}`], ['/auth/code/provider'], ['/referrals/extra'],
  ])('names no device for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual(NONE);
  });

  it.each([
    [`/${DONGLE}/prime/extra`], [`/${DONGLE}/settings`], [`/${DONGLE}/garbage`], [`/${DONGLE}/10/20/30`],
    [`/${DONGLE}/1/${'9'.repeat(400)}`], [`/${DONGLE}/1/9007199254740992`],
  ])('selects only the device for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ ...NONE, dongleId: DONGLE });
  });
});
