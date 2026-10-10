import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('destinationFromUrl', () => {
  it.each([
    ['/', { kind: 'root' }],
    [`/${DONGLE}`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { kind: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { kind: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, logId: LOG, start: 10000, end: 20000 }],
    [`/${DONGLE}/10/20`, { kind: 'legacy', dongleId: DONGLE, start: 10, end: 20 }],
  ])('parses %s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}/20/10`],
    [`/${DONGLE}/${LOG}/10/10`],
    [`/${DONGLE}/${LOG}/9007199254741/9007199254742`],
    [`/${DONGLE}/${LOG}/${'9'.repeat(400)}/${'9'.repeat(401)}`],
  ])('drops an invalid range from %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual({
      kind: 'drive', dongleId: DONGLE, logId: LOG, start: null, end: null,
    });
  });

  it.each([
    '/not-a-device',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/ten/20`,
    `/${DONGLE}/10/20/extra`,
    `/${DONGLE}/20/10`,
    `/${DONGLE}/10/10`,
  ])('rejects %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual({ kind: 'not-found' });
  });
});

describe('urlForDestination', () => {
  it.each([
    ['root', {}, '/'],
    ['dashboard', { dongleId: DONGLE, kind: 'dashboard' }, `/${DONGLE}`],
    ['Prime', { dongleId: DONGLE, kind: 'prime' }, `/${DONGLE}/prime`],
    ['stream', { dongleId: DONGLE, kind: 'stream' }, `/${DONGLE}/stream`],
    ['whole drive', { dongleId: DONGLE, kind: 'drive', logId: LOG, start: null, end: null }, `/${DONGLE}/${LOG}`],
    ['drive range', { dongleId: DONGLE, kind: 'drive', logId: LOG, start: 10000, end: 20000 }, `/${DONGLE}/${LOG}/10/20`],
    ['zero-start range', { dongleId: DONGLE, kind: 'drive', logId: LOG, start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
  ])('serializes a %s destination', (_name, destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});

describe('additional deep links', () => {
  it('parses settings and referrals destinations', () => {
    expect(destinationFromUrl(`/${DONGLE}/settings`)).toEqual({ kind: 'settings', dongleId: DONGLE });
    expect(destinationFromUrl('/referrals')).toEqual({ kind: 'referrals' });
  });

  it('serializes settings and referrals destinations', () => {
    expect(urlForDestination({ kind: 'settings', dongleId: DONGLE })).toBe(`/${DONGLE}/settings`);
    expect(urlForDestination({ kind: 'referrals' })).toBe('/referrals');
  });
});
