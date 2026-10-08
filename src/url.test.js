import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination, safeInternalPath } from './url';

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
    [{ kind: 'settings', dongleId: DONGLE }, `/${DONGLE}/settings`],
    [{ kind: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ kind: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG, start: 10500, end: 20400 }, `/${DONGLE}/${LOG}/10/20`],
    [{ kind: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
    [{ kind: 'legacy', dongleId: DONGLE, start: 1000, end: 2000 }, `/${DONGLE}/1000/2000`],
  ])('formats %j', (destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});

describe('parse/format round trip', () => {
  it.each([
    '/referrals',
    '/demo',
    `/${DONGLE}`,
    `/${DONGLE}/settings`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/stream`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/10/20`,
    `/${DONGLE}/${LOG}/0/20`,
  ])('is stable for %s', (pathname) => {
    expect(urlForDestination(destinationFromUrl(pathname))).toBe(pathname);
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
