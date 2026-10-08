import { describe, expect, it } from 'vitest';

import { DEMO_DONGLE_ID } from './api/demo';
import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const parse = (pathname, search = '') => destinationFromUrl({ pathname, search });

describe('destinationFromUrl', () => {
  it.each([
    ['/', { kind: 'root' }],
    ['/demo', { kind: 'demo' }],
    ['/referrals', { kind: 'referrals' }],
    [`/${DONGLE}`, { kind: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { kind: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { kind: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { kind: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: null, end: null } }],
    [`/${DONGLE}/${LOG}/10/20`, { kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: 10000, end: 20000 } }],
    [`/${DONGLE}/${LOG}/10.5/20.9`, { kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: 10500, end: 20900 } }],
    [`/${DONGLE}/${LOG}/0.001/0.999`, { kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: 1, end: 999 } }],
    [`/${DONGLE}/10/20`, { kind: 'legacy', dongleId: DONGLE, start: 10, end: 20 }],
  ])('parses %s', (pathname, expected) => {
    expect(parse(pathname)).toEqual(expected);
  });

  it('parses a demo drive link as a drive on the demo dongle', () => {
    expect(parse(`/demo/${LOG}`)).toEqual({
      kind: 'drive', dongleId: DEMO_DONGLE_ID, drive: { logId: LOG, start: null, end: null },
    });
    expect(parse(`/demo/${LOG}/5/9`, '?foo=bar')).toEqual({
      kind: 'drive', dongleId: DEMO_DONGLE_ID, drive: { logId: LOG, start: 5000, end: 9000 },
    });
  });

  it('accepts ?modal=settings on drive and dashboard URLs only', () => {
    expect(parse(`/${DONGLE}/${LOG}`, '?modal=settings')).toEqual({
      kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: null, end: null }, modal: 'settings',
    });
    expect(parse(`/${DONGLE}`, '?modal=settings')).toEqual({
      kind: 'dashboard', dongleId: DONGLE, modal: 'settings',
    });
    expect(parse(`/${DONGLE}`, '?modal=settings&device=bbbbbbbbbbbbbbbb')).toEqual({
      kind: 'dashboard', dongleId: DONGLE, modal: 'settings', modalDevice: 'bbbbbbbbbbbbbbbb',
    });
    // pages outside the whitelist drop the modal instead of failing closed
    expect(parse(`/${DONGLE}/prime`, '?modal=settings')).toEqual({ kind: 'prime', dongleId: DONGLE });
    expect(parse(`/${DONGLE}/referrals`, '?modal=settings')).toEqual({ kind: 'not-found' });
    expect(parse(`/${DONGLE}`, '?modal=bogus')).toEqual({ kind: 'dashboard', dongleId: DONGLE });
  });

  it.each([
    `/auth/google`,
    `/auth/apple`,
  ])('parses %s as an auth in-between state', (pathname) => {
    expect(parse(pathname)).toEqual({ kind: 'auth' });
  });

  it.each([
    [`/${DONGLE}/${LOG}/20/10`],
    [`/${DONGLE}/${LOG}/10/10`],
    [`/${DONGLE}/${LOG}/10.999/10.999`],
    [`/${DONGLE}/${LOG}/9007199254741/9007199254742`],
    [`/${DONGLE}/${LOG}/${'9'.repeat(400)}/${'9'.repeat(401)}`],
  ])('drops an invalid range from %s', (pathname) => {
    expect(parse(pathname)).toEqual({
      kind: 'drive', dongleId: DONGLE, drive: { logId: LOG, start: null, end: null },
    });
  });

  it.each([
    '/not-a-device',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/ten/20`,
    `/${DONGLE}/${LOG}/10.5.5/20`,
    `/${DONGLE}/${LOG}/-5/20`,
    `/${DONGLE}/10/20/extra`,
    `/${DONGLE}/20/10`,
    `/${DONGLE}/10/10`,
    `/${DONGLE}/9007199254740992/9007199254740993`,
  ])('rejects %s', (pathname) => {
    expect(parse(pathname)).toEqual({ kind: 'not-found' });
  });
});

describe('urlForDestination', () => {
  it.each([
    ['root', {}, '/'],
    ['referrals', { page: 'referrals' }, '/referrals'],
    ['dashboard', { dongleId: DONGLE, page: 'dashboard', drive: null }, `/${DONGLE}`],
    ['Prime', { dongleId: DONGLE, page: 'prime', drive: null }, `/${DONGLE}/prime`],
    ['stream', { dongleId: DONGLE, page: 'stream', drive: null }, `/${DONGLE}/stream`],
    ['whole drive', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: null, end: null } }, `/${DONGLE}/${LOG}`],
    ['drive range', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    ['zero-start range', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
    ['fractional range', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10500, end: 20900 } }, `/${DONGLE}/${LOG}/10.5/20.9`],
    ['demo drive', { dongleId: DEMO_DONGLE_ID, page: 'drive', drive: { logId: LOG, start: null, end: null }, demo: true }, `/demo/${LOG}`],
    ['settings modal', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 0, end: 20000 }, modal: 'settings' }, `/${DONGLE}/${LOG}/0/20?modal=settings`],
    ['settings modal on another device', { dongleId: DONGLE, page: 'dashboard', drive: null, modal: 'settings', modalDevice: 'bbbbbbbbbbbbbbbb' }, `/${DONGLE}?modal=settings&device=bbbbbbbbbbbbbbbb`],
  ])('serializes a %s destination', (_name, destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });

  it('round-trips fractional ranges exactly', () => {
    const destination = { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10500, end: 10901 } };
    const roundTripped = destinationFromUrl(urlForDestination(destination));
    expect(roundTripped.drive).toEqual({ logId: LOG, start: 10500, end: 10901 });
  });
});
