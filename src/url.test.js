import { describe, expect, it } from 'vitest';

import { parseLocation, buildLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const route = (page, extra = {}) => ({
  page, dongleId: null, routeId: null, start: null, end: null, ...extra,
});

describe('parseLocation', () => {
  it.each([
    ['/', route('dashboard')],
    ['/referrals', route('referrals')],
    [`/${DONGLE}`, route('device', { dongleId: DONGLE })],
    [`/${DONGLE}/`, route('device', { dongleId: DONGLE })],
    [`/${DONGLE}/prime`, route('prime', { dongleId: DONGLE })],
    [`/${DONGLE}/stream`, route('stream', { dongleId: DONGLE })],
    [`/${DONGLE}/settings`, route('settings', { dongleId: DONGLE })],
    [`/${DONGLE}/10/20`, route('device', { dongleId: DONGLE, start: 10, end: 20 })],
    [`/${DONGLE}/${LOG}`, route('drive', { dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/${LOG}/556/610`, route('drive', { dongleId: DONGLE, routeId: LOG, start: 556, end: 610 })],
  ])('parses %s', (pathname, expected) => {
    expect(parseLocation(pathname)).toEqual(expected);
  });

  it.each([
    '/prime', // not a device
    '/not-a-device/prime',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/stream/extra`,
    `/${DONGLE}/settings/extra`,
    `/${DONGLE}/banana`, // neither a keyword, route id, nor range
    `/${DONGLE}/10`, // half a range
    `/${DONGLE}/10/20/30`, // too many segments
    `/${DONGLE}/${LOG}/10`, // half a drive range
    `/${DONGLE}/${LOG}/10/20/30`,
    `/${DONGLE}/abc/def`, // non-numeric range used to parse to NaN bounds
    '/auth/code/provider',
    '/demo', // not a device path; renders the dashboard on the demo backend
  ])('parses %s to null (renders dashboard)', (pathname) => {
    expect(parseLocation(pathname)).toBeNull();
  });

  it('never returns partial state for invalid input', () => {
    // the old helpers parsed this to { start: NaN, end: 10 }
    expect(parseLocation(`/${DONGLE}/${LOG}/10/20/extra`)).toBeNull();
  });
});

describe('buildLocation', () => {
  it.each([
    [route('dashboard'), '/'],
    [route('referrals'), '/referrals'],
    [route('device', { dongleId: DONGLE }), `/${DONGLE}`],
    [route('device', { dongleId: DONGLE, start: 10, end: 20 }), `/${DONGLE}/10/20`],
    [route('drive', { dongleId: DONGLE, routeId: LOG }), `/${DONGLE}/${LOG}`],
    [route('drive', { dongleId: DONGLE, routeId: LOG, start: 556, end: 610 }), `/${DONGLE}/${LOG}/556/610`],
    [route('prime', { dongleId: DONGLE }), `/${DONGLE}/prime`],
    [route('stream', { dongleId: DONGLE }), `/${DONGLE}/stream`],
    [route('settings', { dongleId: DONGLE }), `/${DONGLE}/settings`],
  ])('builds %s', (routeObj, expected) => {
    expect(buildLocation(routeObj)).toBe(expected);
  });

  it.each([
    [route('device'), 'needs a valid dongleId'],
    [route('device', { dongleId: 'nope' }), 'needs a valid dongleId'],
    [route('drive', { dongleId: DONGLE }), 'needs a valid routeId'],
    [route('drive', { dongleId: DONGLE, routeId: LOG, start: 'x', end: 20 }), 'unix seconds'],
    [route('nope', { dongleId: DONGLE }), 'unknown page'],
  ])('throws on invalid input %j', (routeObj, message) => {
    expect(() => buildLocation(routeObj)).toThrow(message);
  });
});

describe('parseLocation <-> buildLocation round trip', () => {
  const shapes = [
    route('dashboard'),
    route('referrals'),
    route('device', { dongleId: DONGLE }),
    route('device', { dongleId: OTHER, start: 0, end: 2000 }),
    route('drive', { dongleId: DONGLE, routeId: LOG }),
    route('drive', { dongleId: DONGLE, routeId: LOG, start: 556, end: 610 }),
    route('prime', { dongleId: DONGLE }),
    route('stream', { dongleId: DONGLE }),
    route('settings', { dongleId: DONGLE }),
  ];

  it.each(shapes)('round-trips %j', (routeObj) => {
    expect(parseLocation(buildLocation(routeObj))).toEqual(routeObj);
  });

  it.each([
    '/',
    '/referrals',
    `/${DONGLE}`,
    `/${DONGLE}/10/20`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/556/610`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
  ])('round-trips pathname %s', (pathname) => {
    expect(buildLocation(parseLocation(pathname))).toBe(pathname);
  });
});
