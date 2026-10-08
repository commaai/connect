import { describe, expect, it } from 'vitest';

import {
  destinationFromUrl, urlForDestination, safeInternalPath,
  overlayFromSearch, withOverlaySearch, stripOverlaySearch,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const DEMO_LOG = '00000000--0000000001';

describe('destinationFromUrl', () => {
  it.each([
    ['/', { kind: 'root' }],
    ['/referrals', { kind: 'referrals' }],
    ['/demo', { kind: 'demo' }],
    [`/${DONGLE}`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { kind: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { kind: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { kind: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }],
    [`/${DONGLE}/${DEMO_LOG}`, { kind: 'drive', dongleId: DONGLE, logId: DEMO_LOG, start: null, end: null }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: 10000, end: 20000 }],
    [`/${DONGLE}/${LOG}/0/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }],
    [`/${DONGLE}/1000/2000`, { kind: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }],
  ])('parses %s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });

  it.each([
    ['an unknown first segment', '/nonsense'],
    ['an unknown branch', `/${DONGLE}/nope`],
    ['a truncated dongle id', `/${DONGLE.slice(0, 15)}`],
    ['a dongle id with a prefix', `/prefix-${DONGLE}`],
    ['a dongle id with a suffix', `/${DONGLE}extra`],
    ['a non-numeric range', `/${DONGLE}/${LOG}/abc/def`],
    ['an inverted range', `/${DONGLE}/${LOG}/20/10`],
    ['a zero-length range', `/${DONGLE}/${LOG}/20/20`],
    ['an overflowing range', `/${DONGLE}/${LOG}/999999999999999/9999999999999999`],
    ['extra segments after a drive', `/${DONGLE}/${LOG}/10/20/30`],
    ['extra segments after stream', `/${DONGLE}/stream/extra`],
    ['extra segments after prime', `/${DONGLE}/prime/extra`],
    ['extra segments after settings', `/${DONGLE}/settings/extra`],
    ['a pure-digit 20-char branch', `/${DONGLE}/12345678901234567890`],
    ['referrals with extra segments', '/referrals/extra'],
    ['demo with extra segments', '/demo/extra'],
  ])('rejects %s', (_name, pathname) => {
    expect(destinationFromUrl(pathname).kind).toBe('not-found');
  });

  it('never throws on odd input', () => {
    for (const value of [undefined, null, '', '//', '/a/b/c/d/e', '/\\\\evil.example']) {
      expect(() => destinationFromUrl(value)).not.toThrow();
    }
  });
});

describe('urlForDestination', () => {
  it.each([
    [{ kind: 'referrals' }, '/referrals'],
    [{ kind: 'demo' }, '/demo'],
    [{ kind: 'root' }, '/'],
    [{ kind: 'not-found' }, '/'],
    [{ kind: 'dashboard', dongleId: DONGLE }, `/${DONGLE}`],
    [{ kind: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ kind: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG, start: 10500, end: 20400 }, `/${DONGLE}/${LOG}/10/21`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
    [{ kind: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }, `/${DONGLE}/1000/2000`],
  ])('formats %j', (destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});

describe('range serialization', () => {
  // A valid selection must never serialize to a URL the parser rejects: the
  // start is floored, the end rounded up, so the interval can only grow.
  it.each([
    ['a sub-second range at zero', 0, 500, 0, 1000],
    ['a range inside one second', 10_200, 10_700, 10_000, 11_000],
    ['a range straddling one second', 10_900, 11_100, 10_000, 12_000],
    ['exact whole seconds', 10_000, 20_000, 10_000, 20_000],
    ['a selection near the route end', 59_500, 60_000, 59_000, 60_000],
    ['the full drive', 0, 60_000, 0, 60_000],
  ])('serializes %s canonically', (_name, start, end, parsedStart, parsedEnd) => {
    const pathname = urlForDestination({ kind: 'drive', dongleId: DONGLE, logId: LOG, start, end });
    expect(destinationFromUrl(pathname)).toEqual({
      kind: 'drive', dongleId: DONGLE, logId: LOG, start: parsedStart, end: parsedEnd,
    });
  });

  it('never produces a zero-length or inverted range from a valid selection', () => {
    for (let start = 0; start < 3000; start += 97) {
      for (let width = 1; width <= 2000; width += 173) {
        const pathname = urlForDestination({ kind: 'drive', dongleId: DONGLE, logId: LOG, start, end: start + width });
        const parsed = destinationFromUrl(pathname);
        expect(parsed.kind).toBe('drive');
        expect(parsed.end).toBeGreaterThan(parsed.start);
        // Formatting the parsed range again is a fixed point.
        expect(urlForDestination(parsed)).toBe(pathname);
      }
    }
  });

  it.each([
    'a safe-integer overflow start',
    'a safe-integer overflow end',
  ])('rejects %s', (name) => {
    const huge = Number.MAX_SAFE_INTEGER + 1;
    const start = name.endsWith('start') ? huge : 0;
    const end = name.endsWith('end') ? huge : 1000;
    const pathname = urlForDestination({ kind: 'drive', dongleId: DONGLE, logId: LOG, start, end });
    expect(destinationFromUrl(pathname).kind).toBe('not-found');
  });
});

describe('overlay query parameters', () => {
  it.each([
    [`?settings=${OTHER}`, { kind: 'settings', dongleId: OTHER }],
    ['?dates=1', { kind: 'dates' }],
    ['?uploads=1', { kind: 'uploads' }],
    ['', null],
    ['?settings=nothex', null],
    [`?settings=${DONGLE.slice(0, 8)}`, null],
    ['?dates=true', null],
    ['?uploads=0', null],
  ])('parses %s', (search, expected) => {
    expect(overlayFromSearch(search)).toEqual(expected);
  });

  it.each([
    ['', { kind: 'settings', dongleId: OTHER }, `?settings=${OTHER}`],
    ['', { kind: 'dates' }, '?dates=1'],
    [`?settings=${OTHER}`, { kind: 'dates' }, '?dates=1'],
    ['', null, ''],
    ['?keep=1', { kind: 'uploads' }, '?keep=1&uploads=1'],
    [`?keep=1&settings=${OTHER}`, null, '?keep=1'],
  ])('rewrites %s with %j to %s', (search, overlay, expected) => {
    expect(withOverlaySearch(search, overlay)).toBe(expected);
    // Removing the overlay restores the bare search.
    expect(stripOverlaySearch(expected)).toBe(withOverlaySearch(search, null));
  });

  it('round-trips parse and format', () => {
    const overlay = { kind: 'settings', dongleId: OTHER };
    expect(overlayFromSearch(withOverlaySearch('', overlay))).toEqual(overlay);
    expect(overlayFromSearch(withOverlaySearch(withOverlaySearch('', overlay), { kind: 'dates' })))
      .toEqual({ kind: 'dates' });
  });
});

describe('parse/format round trip', () => {
  it.each([
    '/referrals',
    '/demo',
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/${LOG}/0/20`,
  ])('is stable for %s', (pathname) => {
    expect(urlForDestination(destinationFromUrl(pathname))).toBe(pathname);
  });

  it('migrates the draft-era settings path to the overlay form', () => {
    expect(destinationFromUrl(`/${DONGLE}/settings`)).toEqual({ kind: 'settings', dongleId: DONGLE });
    // urlForDestination no longer emits a settings path: it is overlay-only.
    expect(urlForDestination({ kind: 'settings', dongleId: DONGLE })).toBe(`/${DONGLE}`);
  });

  it('canonicalizes ranges to whole seconds', () => {
    const parsed = destinationFromUrl(`/${OTHER}/${LOG}/10/20`);
    expect(urlForDestination(parsed)).toBe(`/${OTHER}/${LOG}/10/20`);
  });
});

describe('safeInternalPath', () => {
  it.each([
    ['/referrals', '/referrals'],
    [`/${DONGLE}/${LOG}`, `/${DONGLE}/${LOG}`],
    ['/', '/'],
  ])('accepts %s', (value, expected) => {
    expect(safeInternalPath(value)).toBe(expected);
  });

  it.each([
    ['//evil.example/foo'],
    ['/\\evil.example/foo'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    ['/\u0000/evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['referrals'],
    [undefined],
    [null],
  ])('rejects %s', (value) => {
    expect(safeInternalPath(value)).toBeNull();
  });
});
