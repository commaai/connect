import { describe, expect, it } from 'vitest';

import { parseLocation, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '0000010a--a51155e496';
const DATED_LOG = '2026-08-06--12-00-00';
const DEMO_LOG = '00000000--0000000001';

const nav = (fields) => ({
  page: 'home', dongleId: null, logId: null, zoom: null, legacyRange: null, modal: null, ...fields,
});

describe('parseLocation', () => {
  it.each([
    ['/', nav({})],
    ['/demo', nav({})],
    ['/auth/', nav({})],
    ['/referrals', nav({ page: 'referrals' })],
    [`/${DONGLE}`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, nav({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, nav({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/prime/extra`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${DATED_LOG}`, nav({ page: 'drive', dongleId: DONGLE, logId: DATED_LOG })],
    [`/${DONGLE}/${DEMO_LOG}`, nav({ page: 'drive', dongleId: DONGLE, logId: DEMO_LOG })],
    [`/${DONGLE}/${LOG}/556/610`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${LOG}/1.5/2.25`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 1500, end: 2250 } })],
    [`/${DONGLE}/${LOG}/20/10`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/1/${'9'.repeat(400)}`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/0.0001/0.0002`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/x/10`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/1000/2000`, nav({ page: 'dashboard', dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/1000`, nav({ page: 'dashboard', dongleId: DONGLE })],
    ['/not-a-device/prime', nav({})],
  ])('%s', (pathname, expected) => {
    expect(parseLocation({ pathname })).toEqual(expected);
  });

  it.each([
    ['?modal=settings', 'settings'],
    ['?modal=pair', 'pair'],
    ['?modal=filter', 'filter'],
    ['?modal=unknown', null],
    ['?r=/somewhere', null],
  ])('reads the modal from %s', (search, modal) => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search }).modal).toBe(modal);
  });
});

describe('urlFor', () => {
  it('keeps a subsecond selection nonempty', () => {
    const url = urlFor(nav({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10100, end: 10900 } }));
    expect(parseLocation({ pathname: url }).zoom).toEqual({ start: 10000, end: 11000 });
  });

  it.each([
    [nav({}), '/'],
    [nav({ page: 'dashboard' }), '/'],
    [nav({ page: 'referrals', dongleId: DONGLE }), '/referrals'],
    [nav({ page: 'dashboard', dongleId: DONGLE }), `/${DONGLE}`],
    [nav({ page: 'prime', dongleId: DONGLE }), `/${DONGLE}/prime`],
    [nav({ page: 'stream', dongleId: DONGLE }), `/${DONGLE}/stream`],
    [nav({ page: 'drive', dongleId: DONGLE, logId: LOG }), `/${DONGLE}/${LOG}`],
    [nav({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10999, end: 20500 } }), `/${DONGLE}/${LOG}/10/21`],
    [nav({ page: 'drive', dongleId: DONGLE, logId: LOG, modal: 'settings' }), `/${DONGLE}/${LOG}?modal=settings`],
  ])('builds %j', (fields, expected) => {
    expect(urlFor(fields)).toBe(expected);
  });

  it.each([
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream?modal=settings`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610?modal=pair`,
  ])('round-trips %s', (url) => {
    const [pathname, search] = url.split('?');
    expect(urlFor(parseLocation({ pathname, search: search && `?${search}` }))).toBe(url);
  });
});
