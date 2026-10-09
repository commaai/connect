import { describe, expect, it } from 'vitest';

import { parsePath, pathFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const at = (location) => ({ dongleId: null, routeId: null, zoom: null, page: null, legacyZoom: null, ...location });

describe('URL grammar', () => {
  it.each([
    [`/${DONGLE}`, { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, routeId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { dongleId: DONGLE, routeId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } }],
  ])('%s round-trips', (path, location) => {
    expect(parsePath(path)).toEqual(at(location));
    expect(pathFor(parsePath(path))).toBe(path);
  });

  it('parses a legacy millisecond range', () => {
    expect(parsePath(`/${DONGLE}/1000/2000`)).toEqual(at({ dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 } }));
  });

  it.each([
    ['/', at({})],
    ['/auth/code/provider', at({})],
    ['/not-a-device/prime', at({})],
    [`/${DONGLE}/prime/extra`, at({ dongleId: DONGLE })],
    [`/${DONGLE}/a/b`, at({ dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}/10`, at({ dongleId: DONGLE, routeId: LOG })],
    [`/${DONGLE}/${LOG}/a/b`, at({ dongleId: DONGLE, routeId: LOG })],
  ])('falls back for %s', (path, location) => {
    expect(parsePath(path)).toEqual(location);
  });

  it('rounds a range outward to whole seconds', () => {
    expect(pathFor({ dongleId: DONGLE, routeId: LOG, zoom: { start: 10500, end: 20100 } })).toBe(`/${DONGLE}/${LOG}/10/21`);
  });

  it('builds the root without a device', () => {
    expect(pathFor({ dongleId: null })).toBe('/');
  });
});
