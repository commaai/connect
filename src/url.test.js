import { describe, expect, it } from 'vitest';
import { drivePath, modalLocation, parseNavigation, getDongleID, getZoom, getRouteId, getRouteZoom, getPrimeNav, getStreamNav, safeReturnTo } from './url';
import route from './test-data/public-route.json';

const DONGLE = route.dongle_id;
const LOG = route.fullname.split('|')[1];
const DRIVE = `/${DONGLE}/${LOG}`;

describe('URL grammar', () => {
  it.each([
    ['/', 'home'], ['/demo', 'home'], ['/referrals', 'referrals'], ['/auth/', 'auth'],
    [`/${DONGLE}`, 'dashboard'], [DRIVE, 'drive'], [`/${DONGLE}/prime`, 'prime'], [`/${DONGLE}/stream`, 'stream'],
  ])('parses the %s page', (path, page) => expect(parseNavigation(path).page).toBe(page));

  it('keeps both generations of route identifiers compatible', () => {
    expect(getRouteId(DRIVE)).toBe(LOG);
    expect(getRouteId(`/${DONGLE}/2026-08-06--12-00-00`)).toBe('2026-08-06--12-00-00');
    expect(getZoom(DRIVE)).toBeNull();
    expect(getRouteZoom(DRIVE)).toBeNull();
  });

  it('round trips millisecond ranges, including zero and floating point edge cases', () => {
    for (const start of [0, 1, 1001, 10001]) {
      const pathname = drivePath(DONGLE, LOG, start, 20002);
      expect(getRouteZoom(pathname)).toEqual({ start, end: 20002 });
    }
  });

  it.each(['10', '20/10', '10/10', '-1/20', 'NaN/20', '1e3/2000', '1.0001/20', '9007199254741/9007199254742', '0/20/extra'])('ignores invalid/missing range %s on a valid drive', (suffix) => {
    expect(parseNavigation(`${DRIVE}/${suffix}`)).toMatchObject({ page: 'drive', logId: LOG, range: null });
  });

  it('parses legacy absolute milliseconds without confusing them with route-relative seconds', () => {
    const { start_time_utc_millis: start, end_time_utc_millis: end } = route;
    expect(getZoom(`/${DONGLE}/${start}/${end}`)).toEqual({ start, end });
    expect(getRouteId(`/${DONGLE}/${start}/${end}`)).toBeNull();
  });

  it.each(['/unknown', `/prefix${DONGLE}`, `/${DONGLE}suffix`, `/${DONGLE}/prime/extra`, `/${DONGLE}/stream/extra`, `/${DONGLE}/unknown`])('rejects unsupported path %s', (path) => expect(parseNavigation(path).page).toBe('not-found'));

  it.each(['settings', 'uploads', 'pair', 'clips'])('provides direct %s modal entry above a drive', (modal) => {
    expect(parseNavigation(`${DRIVE}/0/20?modal=${modal}`)).toMatchObject({ page: 'drive', range: { start: 0, end: 20000 }, modal });
  });

  it('demo/root modal entry retains the default dashboard background', () => {
    for (const modal of ['settings', 'uploads', 'filter', 'clips']) {
      expect(parseNavigation(`/demo?modal=${modal}`)).toMatchObject({ page: 'home', modal });
    }
  });

  it('ignores unsupported, repeated and inapplicable modal arguments', () => {
    for (const search of ['?modal=unknown', '?modal=settings&modal=uploads', '?modal=filter']) {
      expect(parseNavigation(`${DRIVE}${search}`).modal).toBeNull();
    }
    expect(parseNavigation('/referrals?modal=settings').modal).toBeNull();
  });

  it('opens/closes a modal without losing the background range or unrelated query arguments', () => {
    const location = { pathname: `${DRIVE}/1.001/20.002`, search: '?share=1', hash: '#camera' };
    const opened = modalLocation(location, 'settings');
    expect(opened).toEqual({ ...location, search: '?share=1&modal=settings' });
    expect(modalLocation(opened, null)).toEqual(location);
  });

  it('keeps supported authentication return links local and rejects unsupported targets', () => {
    expect(safeReturnTo(`${DRIVE}#camera`)).toBe(`${DRIVE}#camera`);
    expect(safeReturnTo(`${DRIVE}/0/20?modal=settings`)).toBe(`${DRIVE}/0/20?modal=settings`);
    for (const target of ['https://example.com', '//example.com', '/\\example.com', '/unknown', '/auth/', null]) {
      expect(safeReturnTo(target)).toBe('/');
    }
  });

  it('settings and upload aliases close to their dashboard', () => {
    expect(parseNavigation(`/${DONGLE}/settings`).modal).toBe('settings');
    expect(modalLocation({ pathname: `/${DONGLE}/uploads`, search: '' }, null).pathname).toBe(`/${DONGLE}`);
    expect(getDongleID(DRIVE)).toBe(DONGLE);
    expect(getPrimeNav(`/${DONGLE}/prime`)).toBe(true);
    expect(getStreamNav(`/${DONGLE}/stream`)).toBe(true);
  });
});
