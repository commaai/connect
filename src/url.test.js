import { describe, expect, it } from 'vitest';

import {
  buildAppUrl,
  getDongleID,
  getZoom,
  getRouteId,
  getRouteZoom,
  getPrimeNav,
  getStreamNav,
  parseAppUrl,
  updateAppUrl,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it('returns null if a pathname segment disappears while it is read', () => {
    let reads = 0;
    const parts = [];
    Object.defineProperty(parts, 0, { get: () => ((reads += 1) === 1 ? DONGLE : '') });
    const pathname = { split: () => ({ filter: () => parts }) };
    expect(getDongleID(pathname)).toBeNull();
  });

  it.each([
    [`/${DONGLE}/10/20`, { start: 10, end: 20 }],
    [`/${DONGLE}/0/20/ignored`, { start: 0, end: 20 }],
    [`/${DONGLE}/${LOG}/10/20`, { start: Number(LOG), end: 10 }],
    [`/${DONGLE}/10`, null],
    ['/auth/code/provider', null],
  ])('getZoom(%s)', (pathname, expected) => {
    expect(getZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, LOG],
    [`/${DONGLE}/${LOG}/10/20`, LOG],
    [`/${DONGLE}/prime`, null],
    [`/${DONGLE}`, null],
  ])('getRouteId(%s)', (pathname, expected) => {
    expect(getRouteId(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/556/610`, { start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { start: 0, end: 20000 }],
    [`/${DONGLE}/10/20`, null],
  ])('getRouteZoom(%s)', (pathname, expected) => {
    expect(getRouteZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/prime`, true],
    [`/${DONGLE}/prime/extra`, false],
    ['/not-a-device/prime', false],
    [`/${DONGLE}/stream`, false],
  ])('getPrimeNav(%s)', (pathname, expected) => {
    expect(getPrimeNav(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/stream`, true],
    [`/${DONGLE}/stream/extra`, false],
    ['/not-a-device/stream', false],
    [`/${DONGLE}/prime`, false],
  ])('getStreamNav(%s)', (pathname, expected) => {
    expect(getStreamNav(pathname)).toBe(expected);
  });
});

describe('application URLs', () => {
  it('parses a device drive URL with a time range', () => {
    expect(parseAppUrl(`/${DONGLE}/${LOG}/10/20`)).toMatchObject({
      dongleId: DONGLE,
      routeId: LOG,
      routeZoom: { start: 10000, end: 20000 },
      modal: null,
    });
  });

  it('rejects invalid device IDs and invalid route ranges', () => {
    expect(parseAppUrl('/not-a-device')).toMatchObject({ dongleId: null, routeId: null });
    expect(parseAppUrl(`/${DONGLE}/${LOG}/20/10`).routeZoom).toBeNull();
  });

  it('builds canonical device, route, and modal URLs', () => {
    expect(buildAppUrl({ dongleId: DONGLE })).toBe(`/${DONGLE}`);
    expect(buildAppUrl({ dongleId: DONGLE, routeId: LOG, start: 10000, end: 20000 }))
      .toBe(`/${DONGLE}/${LOG}/10/20`);
    expect(buildAppUrl({ dongleId: DONGLE, modal: 'settings' }))
      .toBe(`/${DONGLE}?modal=settings`);
  });

  it('updates modal state while preserving the current route and other query args', () => {
    const pathname = `/${DONGLE}/${LOG}/10/20`;
    expect(updateAppUrl(pathname, '?share=abc', { modal: 'create-clip' }))
      .toBe(`${pathname}?share=abc&modal=create-clip`);
    expect(updateAppUrl(pathname, '?share=abc&modal=create-clip', { modal: null }))
      .toBe(`${pathname}?share=abc`);
  });
});
