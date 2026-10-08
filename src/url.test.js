import { describe, expect, it } from 'vitest';

import {
  destinationFromUrl, getDongleID, getRouteId, getRouteZoom, getSettingsDeviceId, getZoom, urlForDestination,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL destinations', () => {
  it.each([
    ['/', { kind: 'root' }],
    [`/${DONGLE}`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { kind: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: null }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 } }],
  ])('parses %s without leaking path syntax into the caller', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });

  it.each([
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`,
    `/${DONGLE}/settings/extra`,
    `/not-${DONGLE}`,
  ])('rejects malformed destination %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual({ kind: 'not-found' });
  });

  it('serializes the canonical, shareable form of each destination', () => {
    expect(urlForDestination({ dongleId: DONGLE, kind: 'settings' })).toBe(`/${DONGLE}/settings`);
    expect(urlForDestination({ dongleId: DONGLE, kind: 'drive', logId: LOG, range: { start: 10000, end: 20000 } }))
      .toBe(`/${DONGLE}/${LOG}/10/20`);
  });

  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/10/20`, { start: 10, end: 20 }],
    [`/${DONGLE}/0/20/ignored`, null],
    [`/${DONGLE}/${LOG}/10/20`, null],
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

  it('exposes settings through the same parser as every other page', () => {
    expect(getSettingsDeviceId(`/${DONGLE}/settings`)).toBe(DONGLE);
    expect(getSettingsDeviceId(`/${DONGLE}`)).toBeNull();
  });
});
