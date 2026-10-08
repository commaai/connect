import { describe, expect, it } from 'vitest';

import {
  getDongleID,
  getZoom,
  getRouteId,
  getRouteZoom,
  getPrimeNav,
  getStreamNav,
  parsePath,
  buildPath,
  secToMs,
  msToSecFloor,
  MS_PER_SEC,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER_DONGLE = '1111bbbb1111bbbb';
const DEMO_DONGLE = 'deadbeefdeadbeef';
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

describe('parsePath canonical shapes', () => {
  it.each([
    ['/', 'root'],
    ['', 'root'],
    [`/${DONGLE}`, 'dashboard'],
    [`/${OTHER_DONGLE}`, 'dashboard'],
    [`/${DONGLE}/${LOG}`, 'drive'],
    [`/${DONGLE}/${LOG}/10/20`, 'driveRange'],
    [`/${DONGLE}/${LOG}/0/20`, 'driveRange'],
    [`/${DONGLE}/${LOG}/556/610`, 'driveRange'],
    [`/${DONGLE}/10/20`, 'legacyRange'],
    [`/${DONGLE}/0/20`, 'legacyRange'],
    [`/${DONGLE}/prime`, 'prime'],
    [`/${DONGLE}/stream`, 'stream'],
    [`/${DONGLE}/settings`, 'settings'],
    ['/referrals', 'referrals'],
    ['/demo', 'demo'],
    ['/demo/anything', 'demo'],
    ['/auth', 'auth'],
    ['/auth/', 'auth'],
    ['/auth/code/provider', 'auth'],
  ])('parsePath(%s) has kind %s', (pathname, kind) => {
    expect(parsePath(pathname).kind).toBe(kind);
  });

  it('parses dashboard fields', () => {
    expect(parsePath(`/${DONGLE}`)).toEqual({
      kind: 'dashboard',
      dongleId: DONGLE,
      logId: null,
      startSec: null,
      endSec: null,
    });
  });

  it('parses whole drive fields', () => {
    expect(parsePath(`/${DONGLE}/${LOG}`)).toEqual({
      kind: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      startSec: null,
      endSec: null,
    });
  });

  it('parses drive range fields as integer seconds', () => {
    expect(parsePath(`/${DONGLE}/${LOG}/556/610`)).toEqual({
      kind: 'driveRange',
      dongleId: DONGLE,
      logId: LOG,
      startSec: 556,
      endSec: 610,
    });
  });

  it('parses legacy range fields as integer seconds', () => {
    expect(parsePath(`/${DONGLE}/10/20`)).toEqual({
      kind: 'legacyRange',
      dongleId: DONGLE,
      logId: null,
      startSec: 10,
      endSec: 20,
    });
  });

  it('parses prime, stream and settings dongle ids', () => {
    expect(parsePath(`/${DONGLE}/prime`).dongleId).toBe(DONGLE);
    expect(parsePath(`/${DONGLE}/stream`).dongleId).toBe(DONGLE);
    expect(parsePath(`/${DONGLE}/settings`)).toEqual({
      kind: 'settings',
      dongleId: DONGLE,
      logId: null,
      startSec: null,
      endSec: null,
    });
  });

  it('treats a valid demo-device path as its shape, not as demo entry', () => {
    // Backend selection (/demo vs demo dongle) stays in api/backend.js.
    expect(parsePath(`/${DEMO_DONGLE}`).kind).toBe('dashboard');
    expect(parsePath(`/${DEMO_DONGLE}/${LOG}`).kind).toBe('drive');
  });
});

describe('parsePath malformed and ambiguous paths', () => {
  it.each([
    ['/prime'],
    ['/not-a-device/prime'],
    ['/not-a-device/stream'],
    [`/${DONGLE}/prime/extra`],
    [`/${DONGLE}/stream/extra`],
    [`/${DONGLE}/settings/extra`],
    [`/${DONGLE}/prime/settings`],
    [`/${DONGLE}/stream/settings`],
    [`/${DONGLE}/Settings`],
    ['/not-a-device/settings'],
    [`/${DONGLE}/10`],
    [`/${DONGLE}/prime/stream`],
    ['/referrals/extra'],
    [`/${DONGLE}/${LOG}/10`],
    [`/${DONGLE}/${LOG}/10/20/extra`],
    [`/${DONGLE}/0/20/ignored`],
    [`/${DONGLE}/${LOG}/10/20/extra`],
    ['/ABCDEFABCDEFABCD'],
    [`/ABCDEFABCDEFABCD/${LOG}`],
    ['///referrals///extra///'],
  ])('parsePath(%s) is unknown', (pathname) => {
    expect(parsePath(pathname).kind).toBe('unknown');
  });

  it('treats empty segments as root, matching legacy split/filter behavior', () => {
    expect(parsePath('//').kind).toBe('root');
    expect(buildPath(parsePath('//'))).toBe('/');
  });

  it.each([
    [`/${DONGLE}/${LOG}/abc/def`],
    [`/${DONGLE}/${LOG}/-5/20`],
    [`/${DONGLE}/${LOG}/10.5/20`],
    [`/${DONGLE}/${LOG}/10/20x`],
    [`/${DONGLE}/abc/def`],
    [`/${DONGLE}/-1/20`],
    [`/${DONGLE}/10.5/20`],
    [`/${DONGLE}//20`],
  ])('parsePath(%s) rejects invalid numeric range', (pathname) => {
    expect(parsePath(pathname).kind).toBe('unknown');
  });

  it('canonical parser is strict about extra segments where legacy helpers are lenient', () => {
    // Frozen legacy behavior ignores trailing extras; canonical does not.
    expect(getZoom(`/${DONGLE}/0/20/ignored`)).toEqual({ start: 0, end: 20 });
    expect(parsePath(`/${DONGLE}/0/20/ignored`).kind).toBe('unknown');
  });
});

describe('parsePath trailing slashes and query strings', () => {
  it.each([
    [`/${DONGLE}/`, 'dashboard'],
    [`/${DONGLE}/${LOG}/`, 'drive'],
    [`/${DONGLE}/${LOG}/10/20/`, 'driveRange'],
    [`/${DONGLE}/10/20/`, 'legacyRange'],
    [`/${DONGLE}/prime/`, 'prime'],
    [`/${DONGLE}/stream/`, 'stream'],
    [`/${DONGLE}/settings/`, 'settings'],
    ['/referrals/', 'referrals'],
    ['/demo/', 'demo'],
  ])('parsePath(%s) ignores a trailing slash', (pathname, kind) => {
    expect(parsePath(pathname).kind).toBe(kind);
  });

  it.each([
    [`/${DONGLE}?pair=token`, 'dashboard'],
    [`/${DONGLE}/${LOG}?r=/other`, 'drive'],
    [`/${DONGLE}/${LOG}/10/20?stripe_success=1`, 'driveRange'],
    [`/${DONGLE}/prime?stripe_cancelled=1`, 'prime'],
    [`/${DONGLE}/settings?pair=x`, 'settings'],
    ['/referrals?code=x&provider=g', 'referrals'],
    ['/demo?pair=token', 'demo'],
  ])('parsePath(%s) ignores query strings without changing shape', (pathname, kind) => {
    expect(parsePath(pathname).kind).toBe(kind);
  });

  it.each([
    [`/${DONGLE}#section`, 'dashboard'],
    [`/${DONGLE}/${LOG}/10/20#t=10`, 'driveRange'],
  ])('parsePath(%s) ignores hash fragments', (pathname, kind) => {
    expect(parsePath(pathname).kind).toBe(kind);
  });

  it('does not treat query-only differences as different shapes', () => {
    expect(parsePath(`/${DONGLE}?pair=a`)).toEqual(parsePath(`/${DONGLE}?pair=b`));
  });
});

describe('buildPath canonical output', () => {
  it.each([
    [{ kind: 'root' }, '/'],
    [{ kind: 'dashboard', dongleId: DONGLE }, `/${DONGLE}`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: 10, endSec: 20 }, `/${DONGLE}/${LOG}/10/20`],
    [{ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: 0, endSec: 20 }, `/${DONGLE}/${LOG}/0/20`],
    [{ kind: 'legacyRange', dongleId: DONGLE, startSec: 10, endSec: 20 }, `/${DONGLE}/10/20`],
    [{ kind: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ kind: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ kind: 'settings', dongleId: DONGLE }, `/${DONGLE}/settings`],
    [{ kind: 'referrals' }, '/referrals'],
    [{ kind: 'demo' }, '/demo'],
    [{ kind: 'auth' }, '/auth/'],
  ])('buildPath(%j) is %s', (parsed, expected) => {
    expect(buildPath(parsed)).toBe(expected);
  });

  it('never emits range parameters for a whole drive', () => {
    expect(buildPath({ kind: 'drive', dongleId: DONGLE, logId: LOG, startSec: 10, endSec: 20 })).toBe(`/${DONGLE}/${LOG}`);
  });

  it('never emits trailing slashes except for root and auth', () => {
    for (const path of [
      buildPath({ kind: 'dashboard', dongleId: DONGLE }),
      buildPath({ kind: 'drive', dongleId: DONGLE, logId: LOG }),
      buildPath({ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: 10, endSec: 20 }),
      buildPath({ kind: 'prime', dongleId: DONGLE }),
      buildPath({ kind: 'stream', dongleId: DONGLE }),
      buildPath({ kind: 'referrals' }),
      buildPath({ kind: 'demo' }),
    ]) {
      expect(path.endsWith('/') ).toBe(false);
    }
  });

  it.each([
    [{ kind: 'unknown' }],
    [{ kind: 'bogus' }],
    [null],
    [undefined],
    [{ kind: 'dashboard', dongleId: 'not-a-device' }],
    [{ kind: 'dashboard', dongleId: null }],
    [{ kind: 'drive', dongleId: DONGLE, logId: 'short' }],
    [{ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: -1, endSec: 20 }],
    [{ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: 10.5, endSec: 20 }],
    [{ kind: 'driveRange', dongleId: DONGLE, logId: LOG, startSec: null, endSec: 20 }],
  ])('buildPath(%j) is null when it cannot produce a canonical path', (parsed) => {
    expect(buildPath(parsed)).toBeNull();
  });
});

describe('parsePath/buildPath round-trip', () => {
  it.each([
    '/',
    `/referrals`,
    '/demo',
    `/${DONGLE}`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/${LOG}/0/20`,
    `/${DONGLE}/10/20`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/settings`,
  ])('round-trips %s exactly', (url) => {
    expect(buildPath(parsePath(url))).toBe(url);
  });

  it('round-trips trailing-slash input to canonical output', () => {
    expect(buildPath(parsePath(`/${DONGLE}/`))).toBe(`/${DONGLE}`);
    expect(buildPath(parsePath(`/${DONGLE}/${LOG}/10/20/`))).toBe(`/${DONGLE}/${LOG}/10/20`);
  });

  it('round-trips query-suffixed input to bare canonical output', () => {
    expect(buildPath(parsePath(`/${DONGLE}?pair=x`))).toBe(`/${DONGLE}`);
    expect(buildPath(parsePath(`/${DONGLE}/${LOG}/10/20?r=/x`))).toBe(`/${DONGLE}/${LOG}/10/20`);
  });
});

describe('seconds versus milliseconds', () => {
  it('documents the URL-seconds to Redux-milliseconds factor once', () => {
    expect(MS_PER_SEC).toBe(1000);
    expect(secToMs(556)).toBe(556000);
    expect(secToMs(0)).toBe(0);
    expect(msToSecFloor(20000)).toBe(20);
    expect(msToSecFloor(19999)).toBe(19);
  });

  it('agrees with getRouteZoom through the shared factor', () => {
    const parsed = parsePath(`/${DONGLE}/${LOG}/556/610`);
    expect(getRouteZoom(`/${DONGLE}/${LOG}/556/610`)).toEqual({
      start: secToMs(parsed.startSec),
      end: secToMs(parsed.endSec),
    });
  });
});

describe('canonical parser agrees with frozen helpers on valid inputs', () => {
  it('agrees on dongle identity for device paths', () => {
    for (const url of [`/${DONGLE}`, `/${DONGLE}/${LOG}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`, `/${DONGLE}/settings`]) {
      expect(getDongleID(url)).toBe(parsePath(url).dongleId);
    }
  });

  it('agrees on route identity for drive paths', () => {
    expect(getRouteId(`/${DONGLE}/${LOG}`)).toBe(parsePath(`/${DONGLE}/${LOG}`).logId);
    expect(getRouteId(`/${DONGLE}/${LOG}/10/20`)).toBe(parsePath(`/${DONGLE}/${LOG}/10/20`).logId);
    expect(getRouteId(`/${DONGLE}/prime`)).toBeNull();
    expect(parsePath(`/${DONGLE}/prime`).logId).toBeNull();
  });

  it('agrees on prime, stream and settings modes', () => {
    expect(getPrimeNav(`/${DONGLE}/prime`)).toBe(true);
    expect(parsePath(`/${DONGLE}/prime`).kind).toBe('prime');
    expect(getStreamNav(`/${DONGLE}/stream`)).toBe(true);
    expect(parsePath(`/${DONGLE}/stream`).kind).toBe('stream');
    expect(getRouteId(`/${DONGLE}/settings`)).toBeNull();
    expect(getPrimeNav(`/${DONGLE}/settings`)).toBe(false);
    expect(getStreamNav(`/${DONGLE}/settings`)).toBe(false);
    expect(parsePath(`/${DONGLE}/settings`).kind).toBe('settings');
  });
});
