import { describe, expect, it } from 'vitest';

import { parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  const empty = { dongleId: null, selectedRouteId: null, zoom: null, legacyZoom: null, primeNav: false, streamNav: false };

  it.each([
    ['/', empty],
    ['/prime', empty],
    ['/auth/code/provider', empty],
    [`/x${DONGLE}`, empty],
    [`/${DONGLE}`, { ...empty, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { ...empty, dongleId: DONGLE, primeNav: true }],
    [`/${DONGLE}/stream`, { ...empty, dongleId: DONGLE, streamNav: true }],
    [`/${DONGLE}/prime/extra`, { ...empty, dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { ...empty, dongleId: DONGLE, selectedRouteId: LOG }],
    [`/${DONGLE}/${LOG}/0/20`, { ...empty, dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/abc/20`, { ...empty, dongleId: DONGLE, selectedRouteId: LOG }],
    [`/${DONGLE}/10/20`, { ...empty, dongleId: DONGLE, legacyZoom: { start: 10, end: 20 } }],
  ])('parseUrl(%s)', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });
});
