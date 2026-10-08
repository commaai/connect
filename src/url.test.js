import { describe, expect, it } from 'vitest';

import { Page, parsePath, pathFor, zoomToKeep } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const CANONICAL = [
  '/',
  '/referrals',
  `/${DONGLE}`,
  `/${DONGLE}/prime`,
  `/${DONGLE}/stream`,
  `/${DONGLE}/settings`,
  `/${DONGLE}/${LOG}`,
  `/${DONGLE}/${LOG}/10/20`,
  `/${DONGLE}/${LOG}/0/20`,
  `/${DONGLE}/${LOG}/110/110`,
];

describe('url', () => {
  it.each(CANONICAL)('round-trips %s', (pathname) => {
    expect(pathFor(parsePath(pathname))).toBe(pathname);
  });

  it('reads a drive range in milliseconds', () => {
    expect(parsePath(`/${DONGLE}/${LOG}/10/20`).zoom).toEqual({ start: 10000, end: 20000 });
  });

  it('reads a legacy timestamp range', () => {
    expect(parsePath(`/${DONGLE}/1000/2000`)).toMatchObject({
      name: Page.legacy, dongleId: DONGLE, legacy: { start: 1000, end: 2000 },
    });
  });

  it('does not treat auth as a device', () => {
    expect(parsePath('/auth/code').name).toBe(Page.home);
  });

  it('keeps a sub-second selection that shares the path seconds', () => {
    const precise = { start: 110200, end: 110800 };
    expect(pathFor({
      name: Page.drive, dongleId: DONGLE, routeId: LOG, zoom: precise,
    })).toBe(`/${DONGLE}/${LOG}/110/110`);
    expect(zoomToKeep(parsePath(`/${DONGLE}/${LOG}/110/110`).zoom, precise)).toBe(precise);
    expect(zoomToKeep(parsePath(`/${DONGLE}/${LOG}/110/110`).zoom, null)).toBeNull();
  });
});
