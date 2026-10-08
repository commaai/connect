import { describe, expect, it } from 'vitest';

import { parsePath, pathFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parsePath', () => {
  it.each([
    ['/', { name: 'home', dongleId: null, routeId: null, zoom: null }],
    ['/referrals', { name: 'referrals', dongleId: null, routeId: null, zoom: null }],
    ['/auth/code', { name: 'home', dongleId: null, routeId: null, zoom: null }],
    [`/${DONGLE}`, { name: 'device', dongleId: DONGLE, routeId: null, zoom: null }],
    [`/${DONGLE}/prime`, { name: 'prime', dongleId: DONGLE, routeId: null, zoom: null }],
    [`/${DONGLE}/stream`, { name: 'stream', dongleId: DONGLE, routeId: null, zoom: null }],
    [`/${DONGLE}/settings`, { name: 'settings', dongleId: DONGLE, routeId: null, zoom: null }],
    [`/${DONGLE}/${LOG}`, { name: 'drive', dongleId: DONGLE, routeId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/10/20`, {
      name: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 },
    }],
    [`/${DONGLE}/1000/2000`, {
      name: 'legacy', dongleId: DONGLE, routeId: null, zoom: null, legacy: { start: 1000, end: 2000 },
    }],
  ])('%s', (pathname, view) => {
    expect(parsePath(pathname)).toEqual(view);
  });
});

describe('pathFor', () => {
  it.each([
    [{ name: 'home' }, '/'],
    [{ name: 'device', dongleId: DONGLE }, `/${DONGLE}`],
    [{ name: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ name: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ name: 'settings', dongleId: DONGLE }, `/${DONGLE}/settings`],
    [{ name: 'drive', dongleId: DONGLE, routeId: LOG }, `/${DONGLE}/${LOG}`],
    [{ name: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } }, `/${DONGLE}/${LOG}`],
    [{ name: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
  ])('%j', (view, pathname) => {
    expect(pathFor(view)).toBe(pathname);
  });
});
