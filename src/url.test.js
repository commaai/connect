import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const none = { dongleId: null, routeId: null, range: null, legacyRange: null, prime: false, stream: false, settings: false };
const device = { ...none, dongleId: DONGLE };

describe('destinationFromUrl', () => {
  it.each([
    ['/', none],
    ['/prime', none],
    ['/auth/code/provider', none],
    ['/not-a-device/prime', none],
    [`/${DONGLE}`, device],
    [`/${DONGLE}/prime`, { ...device, prime: true }],
    [`/${DONGLE}/prime/extra`, device],
    [`/${DONGLE}/stream`, { ...device, stream: true }],
    [`/${DONGLE}/stream/extra`, device],
    [`/${DONGLE}/${LOG}`, { ...device, routeId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { ...device, routeId: LOG, range: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { ...device, routeId: LOG, range: { start: 0, end: 20000 } }],
    [`/${DONGLE}/10/20`, { ...device, legacyRange: { start: 10, end: 20 } }],
    [`/${DONGLE}/10`, device],
    [`/${DONGLE}/settings`, { ...device, settings: true }],
    [`/${DONGLE}/settings/extra`, device],
    [`/${DONGLE.toUpperCase()}`, none],
    [`/${DONGLE}0`, none],
    [`/${DONGLE.slice(1)}`, none],
    [`/${DONGLE}/${LOG}0/10/20`, device],
    [`/${DONGLE}/${LOG}/NaN/20`, { ...device, routeId: LOG }],
    [`/${DONGLE}/${LOG}/10/Infinity`, { ...device, routeId: LOG }],
    [`/${DONGLE}/${LOG}/-5/20`, { ...device, routeId: LOG }],
    [`/${DONGLE}/${LOG}/20/10`, { ...device, routeId: LOG }],
    [`/${DONGLE}/${LOG}/10/10`, { ...device, routeId: LOG }],
    [`/${DONGLE}/NaN/20`, device],
    [`/${DONGLE}/10/Infinity`, device],
    [`/${DONGLE}/-10/20`, device],
    [`/${DONGLE}/20/10`, device],
  ])('parses %s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });
});

describe('urlForDestination', () => {
  it.each([
    ['device', { dongleId: DONGLE }, `/${DONGLE}`],
    ['whole drive', { dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    ['drive range', { dongleId: DONGLE, routeId: LOG, start: 10, end: 20 }, `/${DONGLE}/${LOG}/10/20`],
    ['zero-start drive range', { dongleId: DONGLE, routeId: LOG, start: 0, end: 20 }, `/${DONGLE}/${LOG}/0/20`],
    ['Prime', { dongleId: DONGLE, prime: true }, `/${DONGLE}/prime`],
    ['stream', { dongleId: DONGLE, stream: true }, `/${DONGLE}/stream`],
    ['settings', { dongleId: DONGLE, settings: true }, `/${DONGLE}/settings`],
  ])('generates a %s URL', (_name, dest, expected) => {
    expect(urlForDestination(dest)).toBe(expected);
  });
});
