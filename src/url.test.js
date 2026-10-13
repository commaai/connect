import { describe, expect, it } from 'vitest';

import { destinationFromUrl, urlForDestination } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('urls', () => {
  it.each([
    ['/', '', { page: 'root' }],
    ['/demo', '', { page: 'root' }],
    ['/referrals', '', { page: 'referrals' }],
    [`/${DONGLE}/`, '', { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, '', { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream/extra`, '', { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, '', { page: 'drive', dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/0/20`, '', { page: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }],
    [`/${DONGLE}/${LOG}/20/10`, '', { page: 'drive', dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/10/20`, '', { page: 'legacy', dongleId: DONGLE, start: 10, end: 20 }],
    ['/auth/code/provider', '', { page: 'root' }],
    [`/${DONGLE}`, `?settings=${DONGLE}`, { page: 'dashboard', dongleId: DONGLE, settings: DONGLE }],
    [`/${DONGLE}`, '?settings=x', { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, `?uploads=${DONGLE}`, { page: 'drive', dongleId: DONGLE, logId: LOG, uploads: DONGLE }],
  ])('destinationFromUrl(%s%s)', (pathname, search, expected) => {
    expect(destinationFromUrl(pathname, search)).toEqual({ settings: null, uploads: null, ...expected });
  });

  it.each([
    [{ page: 'dashboard', dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, start: 0, end: 20000 }, `/${DONGLE}/${LOG}/0/20`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, start: 123, end: 1234 }, `/${DONGLE}/${LOG}/0/1`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, settings: DONGLE }, `/${DONGLE}/${LOG}?settings=${DONGLE}`],
    [{ page: 'dashboard', dongleId: DONGLE, uploads: DONGLE }, `/${DONGLE}?uploads=${DONGLE}`],
  ])('urlForDestination(%o)', (destination, expected) => {
    expect(urlForDestination(destination)).toBe(expected);
  });
});
