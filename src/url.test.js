import { describe, expect, it } from 'vitest';

import { getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, parseRoute, routeModalUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it.each([
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE, routeId: null, zoom: null, modal: null }],
    [`/${DONGLE}/${LOG}/10/20?modal=upload-queue`, { page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 }, modal: 'upload-queue' }],
    [`/${DONGLE}/prime?modal=device-settings`, { page: 'prime', modal: 'device-settings', modalDeviceId: DONGLE }],
    [`/${DONGLE}/prime?modal=prime-cancel`, { page: 'prime', dongleId: DONGLE, routeId: null, zoom: null, modal: 'prime-cancel' }],
    [`/${DONGLE}/stream?modal=add-device`, { page: 'stream', modal: 'add-device' }],
    ['/referrals?modal=add-device', { page: 'referrals', modal: 'add-device' }],
    [`/${DONGLE}/${LOG}?modal=clips`, { page: 'drive', modal: 'clips', routeModalClip: null }],
    [`/${DONGLE}/${LOG}?modal=clip-viewer&clip=drive.mp4`, { page: 'drive', modal: 'clip-viewer', routeModalClip: 'drive.mp4' }],
    [`/${DONGLE}?modal=clip-delete&clip=drive.mp4`, { page: 'dashboard', modal: 'clip-delete', routeModalClip: 'drive.mp4' }],
    [`/${DONGLE}/10/20`, { page: 'dashboard', dongleId: DONGLE, routeId: null, zoom: null, legacyRange: { start: 10, end: 20 }, modal: null }],
  ])('parses %s into one route state', (url, expected) => {
    expect(parseRoute(url)).toMatchObject(expected);
  });

  it.each([
    `/${DONGLE}/not-a-time/20`,
    `/${DONGLE}/${LOG}/NaN/20`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/prime?modal=remove-device`,
    `/${DONGLE}/prime?modal=prime-cancel&device=not-a-device`,
  ])('rejects malformed route state from %s', (url) => {
    const route = parseRoute(url);
    expect(route.zoom).toBeNull();
    expect(route.modal).toBeNull();
    expect(route.dongleId).toBe(DONGLE);
  });

  it.each(['', '../drive.mp4', 'folder/drive.mp4', '..%2Fdrive.mp4', '%5Cdrive.mp4', '.mp4'])('rejects unsafe clip route names %s', (clip) => {
    const route = parseRoute(`/${DONGLE}/${LOG}?modal=clip-viewer&clip=${clip}`);
    expect(route.modal).toBeNull();
    expect(route.routeModalClip).toBeNull();
  });

  it('clears stale clip parameters when switching or closing a modal', () => {
    const location = { pathname: `/${DONGLE}/${LOG}`, search: '?modal=clip-viewer&clip=drive.mp4&share=token' };
    expect(routeModalUrl(location, 'clips')).toBe(`/${DONGLE}/${LOG}?modal=clips&share=token`);
    expect(routeModalUrl(location, null)).toBe(`/${DONGLE}/${LOG}?share=token`);
    expect(routeModalUrl(location, 'clip-viewer', null, 'next.mp4'))
      .toBe(`/${DONGLE}/${LOG}?modal=clip-viewer&share=token&clip=next.mp4`);
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
    [`/${DONGLE}/${LOG}/10/20`, { start: 10000, end: 20000 }],
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

  it.each([`/${DONGLE}/${LOG}/NaN/20`, `/${DONGLE}/${LOG}/20/10`])('rejects invalid route zooms in helper wrappers', (pathname) => {
    expect(getZoom(pathname)).toBeNull();
    expect(getRouteZoom(pathname)).toBeNull();
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
