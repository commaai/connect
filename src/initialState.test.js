import { describe, expect, it } from 'vitest';

import { createInitialState } from './initialState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function urlState(pathname) {
  const { dongleId, primeNav, streamNav, zoom, selectedRouteId } = createInitialState(pathname);
  return { dongleId, primeNav, streamNav, zoom, selectedRouteId };
}

describe('createInitialState cold-entry URL values', () => {
  it.each([
    ['/', { dongleId: null, primeNav: false, streamNav: false, zoom: null, selectedRouteId: null }],
    [`/${DONGLE}`, { dongleId: DONGLE, primeNav: false, streamNav: false, zoom: null, selectedRouteId: null }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, primeNav: false, streamNav: false, zoom: null, selectedRouteId: LOG }],
    [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, primeNav: false, streamNav: false, zoom: { start: 10000, end: 20000 }, selectedRouteId: LOG }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, primeNav: true, streamNav: false, zoom: null, selectedRouteId: null }],
    [`/${DONGLE}/stream`, { dongleId: DONGLE, primeNav: false, streamNav: true, zoom: null, selectedRouteId: null }],
    [`/${DONGLE}/1000/2000`, { dongleId: DONGLE, primeNav: false, streamNav: false, zoom: null, selectedRouteId: null }],
    ['/referrals', { dongleId: null, primeNav: false, streamNav: false, zoom: null, selectedRouteId: null }],
    ['/demo', { dongleId: null, primeNav: false, streamNav: false, zoom: null, selectedRouteId: null }],
  ])('seeds %s identically to legacy derivation', (pathname, expected) => {
    expect(urlState(pathname)).toEqual(expected);
  });

  it('ignores trailing slashes exactly like the previous derivation', () => {
    expect(urlState(`/${DONGLE}/`).dongleId).toBe(DONGLE);
    expect(urlState(`/${DONGLE}/${LOG}/10/20/`).zoom).toEqual({ start: 10000, end: 20000 });
  });
});
