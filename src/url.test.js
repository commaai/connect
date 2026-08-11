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
    '/not-a-device',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/${LOG}/ten/20`,
    `/${DONGLE}/10/20/extra`,
  ])('rejects %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual({ kind: 'not-found' });
  });
});

describe('urlForDestination', () => {
  it.each([
    ['root', {}, '/'],
    ['dashboard', { dongleId: DONGLE, page: 'dashboard', drive: null }, `/${DONGLE}`],
    ['Prime', { dongleId: DONGLE, page: 'prime', drive: null }, `/${DONGLE}/prime`],
    ['stream', { dongleId: DONGLE, page: 'stream', drive: null }, `/${DONGLE}/stream`],
    ['whole drive', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: null, end: null } }, `/${DONGLE}/${LOG}`],
    ['drive range', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    ['zero-start range', { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 0, end: 20000 } }, `/${DONGLE}/${LOG}/0/20`],
  ])('serializes a %s destination', (_name, destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});
