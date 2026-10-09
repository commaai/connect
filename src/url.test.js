import { describe, expect, it } from 'vitest';

import {
  getDongleID,
  getZoom,
  getRouteId,
  getRouteZoom,
  getPrimeNav,
  getStreamNav,
  getSettingsNav,
  parsePath,
  urlForState,
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

  it.each([
    [`/${DONGLE}/settings`, true],
    [`/${DONGLE}/settings/extra`, false],
    ['/not-a-device/settings', false],
    [`/${DONGLE}`, false],
    [`/${DONGLE}/prime`, false],
  ])('getSettingsNav(%s)', (pathname, expected) => {
    expect(getSettingsNav(pathname)).toBe(expected);
  });

  describe('parsePath', () => {
    it('parses root', () => {
      expect(parsePath('/')).toMatchObject({ view: 'root', dongleId: null });
    });

    it('parses dashboard', () => {
      expect(parsePath(`/${DONGLE}`)).toMatchObject({ view: 'dashboard', dongleId: DONGLE, settingsNav: false });
    });

    it('parses settings modal', () => {
      expect(parsePath(`/${DONGLE}/settings`)).toMatchObject({ view: 'settings', dongleId: DONGLE, settingsNav: true });
    });

    it('parses prime modal', () => {
      expect(parsePath(`/${DONGLE}/prime`)).toMatchObject({ view: 'prime', dongleId: DONGLE, primeNav: true });
    });

    it('parses stream view', () => {
      expect(parsePath(`/${DONGLE}/stream`)).toMatchObject({ view: 'stream', dongleId: DONGLE, streamNav: true });
    });

    it('parses drive view', () => {
      expect(parsePath(`/${DONGLE}/${LOG}`)).toMatchObject({ view: 'drive', dongleId: DONGLE, routeId: LOG, zoom: null });
    });

    it('parses drive view with zoom', () => {
      expect(parsePath(`/${DONGLE}/${LOG}/10/20`)).toMatchObject({
        view: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 },
      });
    });

    it('parses legacy timestamp drive', () => {
      expect(parsePath(`/${DONGLE}/1000/2000`)).toMatchObject({
        view: 'legacy', dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 },
      });
    });

    it('parses redirect and pair query parameters', () => {
      expect(parsePath('/', '?r=/device&pair=token123')).toMatchObject({
        redirectRoute: '/device', pairToken: 'token123',
      });
      expect(parsePath(`/${DONGLE}/settings?r=/foo`)).toMatchObject({
        view: 'settings', dongleId: DONGLE, settingsNav: true, redirectRoute: '/foo',
      });
    });

    it('handles hashes and trailing slashes cleanly', () => {
      expect(parsePath(`/${DONGLE}/settings#section`)).toMatchObject({
        view: 'settings', dongleId: DONGLE, settingsNav: true,
      });
      expect(parsePath(`/${DONGLE}/settings/`)).toMatchObject({
        view: 'settings', dongleId: DONGLE, settingsNav: true,
      });
    });

    it('parses drive route with incomplete zoom as drive with null zoom', () => {
      expect(parsePath(`/${DONGLE}/${LOG}/10`)).toMatchObject({
        view: 'drive', dongleId: DONGLE, routeId: LOG, zoom: null,
      });
    });

    it('rejects inverted zoom range where start exceeds end', () => {
      expect(parsePath(`/${DONGLE}/${LOG}/50/20`)).toMatchObject({
        view: 'drive', dongleId: DONGLE, routeId: LOG, zoom: null,
      });
    });

    it('handles uppercase and mixed-case dongle IDs seamlessly', () => {
      expect(parsePath(`/${DONGLE.toUpperCase()}`)).toMatchObject({
        view: 'dashboard', dongleId: DONGLE,
      });
      expect(parsePath(`/${DONGLE.toUpperCase()}/settings`)).toMatchObject({
        view: 'settings', dongleId: DONGLE, settingsNav: true,
      });
    });
  });

  describe('urlForState', () => {
    it('constructs URLs from positional arguments', () => {
      expect(urlForState(DONGLE)).toBe(`/${DONGLE}`);
      expect(urlForState(DONGLE, LOG)).toBe(`/${DONGLE}/${LOG}`);
      expect(urlForState(DONGLE, LOG, 10, 20)).toBe(`/${DONGLE}/${LOG}/10/20`);
      expect(urlForState(DONGLE, LOG, 0, 20)).toBe(`/${DONGLE}/${LOG}`);
      expect(urlForState(DONGLE, null, null, null, true)).toBe(`/${DONGLE}/prime`);
      expect(urlForState(DONGLE, null, null, null, false, true)).toBe(`/${DONGLE}/stream`);
      expect(urlForState(DONGLE, null, null, null, false, false, true)).toBe(`/${DONGLE}/settings`);
    });

    it('constructs URLs from state object', () => {
      expect(urlForState({})).toBe('/');
      expect(urlForState({ dongleId: DONGLE })).toBe(`/${DONGLE}`);
      expect(urlForState({ dongleId: DONGLE, settingsNav: true })).toBe(`/${DONGLE}/settings`);
      expect(urlForState({ dongleId: DONGLE, primeNav: true })).toBe(`/${DONGLE}/prime`);
      expect(urlForState({ dongleId: DONGLE, streamNav: true })).toBe(`/${DONGLE}/stream`);
      expect(urlForState({ dongleId: DONGLE, routeId: LOG })).toBe(`/${DONGLE}/${LOG}`);
      expect(urlForState({ dongleId: DONGLE, routeId: LOG, zoom: { start: 10000, end: 20000 } })).toBe(`/${DONGLE}/${LOG}/10/20`);
      expect(urlForState({ dongleId: DONGLE, routeId: LOG, zoom: { start: 0, end: 20000 } })).toBe(`/${DONGLE}/${LOG}`);
      expect(urlForState({ dongleId: DONGLE, routeId: LOG, start: 0, end: 20 })).toBe(`/${DONGLE}/${LOG}`);
    });
  });
});

