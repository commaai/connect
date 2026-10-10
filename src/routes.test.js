import { describe, expect, it } from 'vitest';

import { parseLocation, urlFor } from './routes';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseLocation', () => {
  it.each([
    ['', null, null, null, null, false, false],
    ['/', null, null, null, null, false, false],
    [`/${DONGLE}`, DONGLE, null, null, null, false, false],
    [`/${DONGLE}/`, DONGLE, null, null, null, false, false],
    [`/${DONGLE}//`, DONGLE, null, null, null, false, false],
    [`/${DONGLE}/${LOG}`, DONGLE, LOG, null, null, false, false],
    [`/${DONGLE}/${LOG}/`, DONGLE, LOG, null, null, false, false],
    [`/${DONGLE}/${LOG}/10/20`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/${LOG}/0/20`, DONGLE, LOG, { start: 0, end: 20000 }, { start: NaN, end: 0 }, false, false],
    [`/${DONGLE}/${LOG}/10/20/`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/10/20`, DONGLE, null, null, { start: 10, end: 20 }, false, false],
    [`/${DONGLE}/0/20`, DONGLE, null, null, { start: 0, end: 20 }, false, false],
    [`/${DONGLE}/1000/2000`, DONGLE, null, null, { start: 1000, end: 2000 }, false, false],
    [`/${DONGLE}/prime`, DONGLE, null, null, null, true, false],
    [`/${DONGLE}/prime/`, DONGLE, null, null, null, true, false],
    [`/${DONGLE}/stream`, DONGLE, null, null, null, false, true],
    [`/${DONGLE}/stream/`, DONGLE, null, null, null, false, true],
    ['/referrals', null, null, null, null, false, false],
    ['/referrals/', null, null, null, null, false, false],
    ['/auth/', null, null, null, null, false, false],
    ['/auth/code/provider', null, null, null, null, false, false],
    ['/not-a-device', null, null, null, null, false, false],
    ['/prime', null, null, null, null, false, false],
    ['/stream', null, null, null, null, false, false],
    ['/referrals/extra', null, null, null, null, false, false],
    [`/${DONGLE.toUpperCase()}`, null, null, null, null, false, false],
    [`/${DONGLE}/PRIME`, DONGLE, null, null, null, false, false],
    [`/${DONGLE}/${LOG}/10/20/extra`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/prime/extra`, DONGLE, null, null, { start: NaN, end: NaN }, false, false],
    [`/${DONGLE}/10`, DONGLE, null, null, null, false, false],
    [`/${DONGLE}/${LOG}/10`, DONGLE, LOG, null, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/${LOG}/abc/def`, DONGLE, LOG, { start: NaN, end: NaN }, { start: NaN, end: NaN }, false, false],
    [`/${DONGLE}/${LOG}/-5/20`, DONGLE, LOG, { start: -5000, end: 20000 }, { start: NaN, end: -5 }, false, false],
    [`/${DONGLE}/-5/20`, DONGLE, null, null, { start: -5, end: 20 }, false, false],
    [`/${DONGLE}/${LOG}/999999999999/999999999999`, DONGLE, LOG, { start: 999999999999000, end: 999999999999000 }, { start: NaN, end: 999999999999 }, false, false],
    [`/${DONGLE}/${LOG}/10/20/30/40`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/${LOG}/10/`, DONGLE, LOG, null, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/${LOG}/10/20/30`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
    [`/${DONGLE}/${LOG}/10/20/30/40/50`, DONGLE, LOG, { start: 10000, end: 20000 }, { start: NaN, end: 10 }, false, false],
  ])('parseLocation(%s)', (pathname, dongleId, logId, zoom, legacyZoom, isPrime, isStream) => {
    const result = parseLocation({ pathname });
    expect(result.dongleId).toBe(dongleId);
    expect(result.logId).toBe(logId);
    expect(result.zoom).toEqual(zoom);
    expect(result.legacyZoom).toEqual(legacyZoom);
    expect(result.isPrime).toBe(isPrime);
    expect(result.isStream).toBe(isStream);
  });
});

describe('urlFor', () => {
  it.each([
    [{ isReferrals: true }, '/referrals'],
    [{ dongleId: null }, '/'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10000/20000`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 123, end: 1234 } }, `/${DONGLE}/${LOG}/123/1234`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 1500, end: 1999 } }, `/${DONGLE}/${LOG}/1500/1999`],
    [{ dongleId: DONGLE, logId: LOG, zoom: { start: 999, end: 1001 } }, `/${DONGLE}/${LOG}/999/1001`],
    [{ dongleId: DONGLE, isPrime: true }, `/${DONGLE}/prime`],
    [{ dongleId: DONGLE, isStream: true }, `/${DONGLE}/stream`],
  ])('urlFor(%j) => %s', (route, expected) => {
    expect(urlFor(route)).toBe(expected);
  });
});
