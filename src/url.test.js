import { describe, expect, it } from 'vitest';
import { getDongleID, getRouteId, getRouteZoom, getZoom, locationWithDialog, parseLocation, urlForLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const compact = ({ page, dongleId, routeId, zoom, legacyZoom, dialog, dialogDevice }) => ({ page, dongleId, routeId, zoom, legacyZoom, dialog, dialogDevice });

describe('application URL grammar', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/auth/', 'auth'], ['/referrals', 'referrals'],
    [`/${DONGLE}`, 'device'], [`/${DONGLE}/prime`, 'prime'], [`/${DONGLE}/stream`, 'stream'],
    [`/${DONGLE}/${LOG}`, 'drive'], [`/${DONGLE}/${LOG}/0/20`, 'drive'],
    [`/${DONGLE}/1000/2000`, 'legacy'],
  ])('parses %s and round trips its navigation intent', (path, page) => {
    const route = parseLocation(path);
    expect(route.page).toBe(page);
    expect(compact(parseLocation(urlForLocation(route)))).toEqual(compact(route));
  });

  it.each([
    `/prefix${DONGLE}`, `/${DONGLE}suffix`, `/${DONGLE}//prime`, `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/1`, `/${DONGLE}/${LOG}/1/2/extra`, `/${DONGLE}/${LOG}/NaN/20`,
    `/${DONGLE}/${LOG}/0/Infinity`, `/${DONGLE}/${LOG}/-1/20`, `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/20/20`, `/${DONGLE}/${LOG}/0/1.0001`, `/${DONGLE}/1.5/20`,
    `/${DONGLE}/${LOG}/0/9007199254741`, `/${DONGLE}/%E0%A4%A`, '/auth/code/provider',
    '/missing/path', '//example.com/path', 'https://example.com/path',
  ])('rejects malformed or unsupported path %s', (path) => {
    expect(parseLocation(path)).toMatchObject({ page: 'not-found', dongleId: null, routeId: null, dialog: null });
  });

  it.each([0, 1001, 1003, 1007, 1234567])('round trips an exact %d millisecond start', (start) => {
    const route = { page: 'drive', dongleId: DONGLE, routeId: LOG, zoom: { start, end: start + 20000 } };
    expect(parseLocation(urlForLocation(route)).zoom).toEqual(route.zoom);
  });

  it('distinguishes legacy absolute time from drive-relative time', () => {
    expect(getZoom(`/${DONGLE}/${LOG}/10/20`)).toBeNull();
    expect(getRouteZoom(`/${DONGLE}/${LOG}/10/20`)).toEqual({ start: 10000, end: 20000 });
    expect(getZoom(`/${DONGLE}/1000/2000`)).toEqual({ start: 1000, end: 2000 });
    expect(getRouteId(`/${DONGLE}/1000/2000`)).toBeNull();
    expect(getDongleID(`/${DONGLE}/${LOG}`)).toBe(DONGLE);
  });

  it('retains the complete background route and a different settings target', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/0/20`, search: '?ci=1', hash: '#video' };
    const opened = locationWithDialog(location, 'settings', OTHER);
    expect(parseLocation(opened)).toMatchObject({ page: 'drive', dialog: 'settings', dialogDevice: OTHER, zoom: { start: 0, end: 20000 } });
    expect(locationWithDialog(opened, null)).toEqual(location);
  });

  it.each(['files', 'route-info', 'clips', 'uploads', 'settings'])('opens %s on a drive without another target argument', (dialog) => {
    expect(parseLocation(locationWithDialog(`/${DONGLE}/${LOG}`, dialog))).toMatchObject({ dialog, dialogDevice: DONGLE });
  });

  it.each(['prime-plan', 'prime-cancel'])('restricts %s to its Prime page', (dialog) => {
    expect(parseLocation(`/${DONGLE}/prime?dialog=${dialog}`).dialog).toBe(dialog);
    expect(parseLocation(`/${DONGLE}?dialog=${dialog}`).dialog).toBeNull();
    expect(parseLocation(`/${DONGLE}/prime?dialog=${dialog}&dialogDevice=${OTHER}`).dialog).toBeNull();
  });

  it.each(['unknown', 'settings&dialogDevice=invalid', 'settings&dialog=uploads', `settings&dialogDevice=${DONGLE}&dialogDevice=${OTHER}`])('ignores invalid dialog specification %s', (query) => {
    expect(parseLocation(`/${DONGLE}?dialog=${query}`).dialog).toBeNull();
  });

  it.each(['time-filter', 'clips'])('rejects a different device target for %s', (dialog) => {
    expect(parseLocation(`/${DONGLE}?dialog=${dialog}&dialogDevice=${OTHER}`).dialog).toBeNull();
  });

  it('opens pairing with no selected device, and requires a device for settings', () => {
    expect(parseLocation('/?dialog=add-device')).toMatchObject({ dialog: 'add-device', dialogDevice: null });
    expect(parseLocation('/?dialog=settings').dialog).toBeNull();
  });

  it.each(['settings', 'add-device', 'time-filter', 'files', 'route-info', 'clips', 'uploads', 'prime-plan', 'prime-cancel'])('rejects %s over an active stream', (dialog) => {
    expect(parseLocation(`/${DONGLE}/stream?dialog=${dialog}&dialogDevice=${DONGLE}`)).toMatchObject({
      page: 'stream', dongleId: DONGLE, dialog: null, dialogDevice: null,
    });
    expect(parseLocation(`/${DONGLE}/stream?dialog=${dialog}`)).toMatchObject({
      page: 'stream', dongleId: DONGLE, dialog: null, dialogDevice: null,
    });
  });

});
