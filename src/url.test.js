import { describe, expect, it } from 'vitest';

import { buildPath, parseLocation, PAGES } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function location(overrides) {
  return {
    page: PAGES.DASHBOARD,
    dongleId: null,
    logId: null,
    zoom: null,
    legacyRange: null,
    ...overrides,
  };
}

describe('parseLocation', () => {
  it.each([
    ['/', location()],
    ['//', location()],
    [`/${DONGLE}/`, location({ dongleId: DONGLE })],
    [`/${DONGLE}`, location({ dongleId: DONGLE })],
    [`/${DONGLE}/prime`, location({ dongleId: DONGLE, page: PAGES.PRIME })],
    [`/${DONGLE}/stream`, location({ dongleId: DONGLE, page: PAGES.STREAM })],
    [`/${DONGLE}/settings`, location({ dongleId: DONGLE, page: PAGES.SETTINGS })],
    ['/referrals', location({ page: PAGES.REFERRALS })],
    ['/referrals/', location({ page: PAGES.REFERRALS })],
    ['/auth/code/provider', location({ page: PAGES.AUTH })],
    [`/${DONGLE}/${LOG}`, location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG })],
    [
      `/${DONGLE}/${LOG}/10/20`,
      location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG, zoom: { start: 10000, end: 20000 } }),
    ],
    [
      `/${DONGLE}/${LOG}/0/20`,
      location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG, zoom: { start: 0, end: 20000 } }),
    ],
    [
      `/${DONGLE}/${LOG}/10/20/ignored`,
      location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG, zoom: { start: 10000, end: 20000 } }),
    ],
    // malformed ranges are dropped instead of parsed into NaNs
    [`/${DONGLE}/${LOG}/abc/20`, location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG })],
    [`/${DONGLE}/1000/2000`, location({ dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/1000/2000/ignored`, location({ dongleId: DONGLE, legacyRange: { start: 1000, end: 2000 } })],
    [`/${DONGLE}/10/20`, location({ dongleId: DONGLE, legacyRange: { start: 10, end: 20 } })],
    // a named page with trailing junk is not that page
    [`/${DONGLE}/prime/extra`, location({ dongleId: DONGLE })],
    [`/${DONGLE}/not-a-log/extra`, location({ dongleId: DONGLE })],
    // no device in the first segment: unknown (rendered like a bare dashboard)
    ['/prime', location({ page: PAGES.UNKNOWN })],
    ['/not-a-device/prime', location({ page: PAGES.UNKNOWN })],
    [`/${LOG}`, location({ page: PAGES.UNKNOWN })],
  ])('parses %s', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual(expected);
  });

  it('drops a legacy range without a device', () => {
    expect(parseLocation('/nope/1000/2000').legacyRange).toBeNull();
  });
});

describe('buildPath', () => {
  it.each([
    [location(), '/'],
    [location({ dongleId: DONGLE }), `/${DONGLE}`],
    [location({ dongleId: DONGLE, page: PAGES.PRIME }), `/${DONGLE}/prime`],
    [location({ dongleId: DONGLE, page: PAGES.STREAM }), `/${DONGLE}/stream`],
    [location({ dongleId: DONGLE, page: PAGES.SETTINGS }), `/${DONGLE}/settings`],
    [location({ page: PAGES.REFERRALS }), '/referrals'],
    [location({ page: PAGES.AUTH }), '/auth'],
    [location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG }), `/${DONGLE}/${LOG}`],
    [
      location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG, zoom: { start: 10000, end: 20000 } }),
      `/${DONGLE}/${LOG}/10/20`,
    ],
    // milliseconds are stored as whole seconds, including a zero start
    [
      location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: LOG, zoom: { start: 0, end: 20999 } }),
      `/${DONGLE}/${LOG}/0/20`,
    ],
    // locations that don't fit the grammar degrade to the dashboard
    [location({ dongleId: DONGLE, page: PAGES.DRIVE, logId: null }), `/${DONGLE}`],
    [location({ dongleId: DONGLE, page: PAGES.UNKNOWN }), `/${DONGLE}`],
  ])('builds %j', (loc, expected) => {
    expect(buildPath(loc)).toBe(expected);
  });

  it.each([
    '/',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
    '/referrals',
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/${LOG}/0/20`,
  ])('round-trips %s through build and parse', (pathname) => {
    expect(parseLocation(buildPath(parseLocation(pathname)))).toEqual(parseLocation(pathname));
  });

  it('round-trips every field of a ranged drive location', () => {
    const parsed = parseLocation(`/${DONGLE}/${LOG}/10/20`);
    expect(buildPath(parsed)).toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(parseLocation(buildPath(parsed))).toEqual(parsed);
  });
});
