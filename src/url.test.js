import { describe, expect, it } from 'vitest';
import { DIALOGS, PAGES, dialogUrl, driveUrl, parseUrl, selectUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const DRIVE = `/${DONGLE}/${LOG}`;

describe('URL contract', () => {
  it.each([
    ['/', PAGES.HOME], ['/demo', PAGES.HOME], ['/referrals', PAGES.REFERRALS],
    [`/${DONGLE}`, PAGES.DASHBOARD], [`/${DONGLE}/`, PAGES.DASHBOARD],
    [`/${DONGLE}/prime`, PAGES.PRIME], [`/${DONGLE}/stream`, PAGES.STREAM],
    [DRIVE, PAGES.DRIVE], [`${DRIVE}/0/20`, PAGES.DRIVE],
    [`/${DONGLE}/1000/2000`, PAGES.LEGACY],
  ])('recognizes %s', (path, page) => expect(parseUrl(path).page).toBe(page));

  it.each([
    '/not-a-device/prime', `/${DONGLE.toUpperCase()}/prime`, `/${DONGLE}/prime/extra`,
    `${DRIVE}/extra`, `${DRIVE}/0/20/extra`, `${DRIVE}/20/10`, `${DRIVE}/10/10`,
    `${DRIVE}/-1/20`, `${DRIVE}/NaN/20`, `${DRIVE}/1e3/2000`, `${DRIVE}/1.0001/2`,
    `${DRIVE}/0/9007199254740992`, `/${DONGLE}/2000/1000`, `/${DONGLE}/1.5/2.5`,
  ])('rejects malformed paths: %s', (path) => {
    expect(parseUrl(path)).toMatchObject({ page: PAGES.NOT_FOUND, dongleId: null, logId: null, zoom: null });
  });

  it.each([
    [{ start: 0, end: 20000 }, '/0/20'],
    [{ start: 10400, end: 20900 }, '/10.4/20.9'],
    [{ start: 10001, end: 10999 }, '/10.001/10.999'],
    [{ start: 1001, end: 1002 }, '/1.001/1.002'],
  ])('round-trips millisecond precision %j', (zoom, suffix) => {
    const path = urlFor({ dongleId: DONGLE, logId: LOG, zoom });
    expect(path).toBe(DRIVE + suffix);
    expect(parseUrl(path).zoom).toEqual(zoom);
  });

  it.each(['/', '/referrals', `/${DONGLE}`, `/${DONGLE}/prime`, `/${DONGLE}/stream`, DRIVE])('round-trips %s', path => {
    expect(urlFor(parseUrl(path))).toBe(path);
  });

  it('keeps legacy ranges in milliseconds', () => {
    expect(parseUrl(`/${DONGLE}/1000/2000`).legacyRange).toEqual({ start: 1000, end: 2000 });
  });

  it.each([
    [DIALOGS.SETTINGS, DRIVE], [DIALOGS.UNPAIR, DRIVE], [DIALOGS.SETTINGS_UPLOADS, DRIVE],
    [DIALOGS.ADD_DEVICE, '/'], [DIALOGS.FILTER, `/${DONGLE}`], [DIALOGS.UPLOADS, DRIVE],
    [DIALOGS.CANCEL_PRIME, `/${DONGLE}/prime`], [DIALOGS.SWITCH_PRIME, `/${DONGLE}/prime`],
  ])('opens %s on its page', (dialog, path) => {
    expect(parseUrl(path, `?dialog=${dialog}`).dialog).toBe(dialog);
  });

  it.each(['unknown', '__proto__', 'constructor', 'filter', 'cancel-prime'])('ignores inapplicable dialogs: %s', dialog => {
    expect(parseUrl(DRIVE, `?dialog=${dialog}`)).toMatchObject({ page: PAGES.DRIVE, dialog: null });
  });

  it.each(['?dialog=settings&device=bad', '?dialog=settings&dialog=unpair', `?dialog=settings&device=${OTHER}&device=${DONGLE}`])('ignores ambiguous dialog arguments %s', search => {
    expect(parseUrl(DRIVE, search).dialog).toBeNull();
  });

  it('identifies settings independently of the page device', () => {
    expect(parseUrl(DRIVE, `?dialog=settings&device=${OTHER}`)).toMatchObject({ dongleId: DONGLE, dialogDevice: OTHER });
    expect(parseUrl('/referrals', `?dialog=settings&device=${OTHER}`).dialogDevice).toBe(OTHER);
    expect(parseUrl('/referrals', '?dialog=settings').dialog).toBeNull();
  });

  it('changes only dialog query parameters', () => {
    const location = { pathname: DRIVE, search: '?keep=yes&dialog=settings&device=old', hash: '#position' };
    expect(dialogUrl(location, DIALOGS.SETTINGS, OTHER)).toBe(`${DRIVE}?keep=yes&dialog=settings&device=${OTHER}#position`);
    expect(dialogUrl(location, null)).toBe(`${DRIVE}?keep=yes#position`);
  });

  it('omits the whole-drive range', () => {
    const state = { dongleId: DONGLE, routes: [{ log_id: LOG, duration: 60000 }] };
    expect(driveUrl(state, LOG, { start: 0, end: 60000 })).toBe(DRIVE);
    expect(driveUrl(state, LOG, null)).toBe(DRIVE);
    expect(driveUrl(state, LOG, { start: 0, end: 20000 })).toBe(`${DRIVE}/0/20`);
  });

  it('reuses the parsed location until navigation changes', () => {
    const location = { pathname: DRIVE, search: '' };
    const parsed = selectUrl({ router: { location } });
    expect(selectUrl({ router: { location } })).toBe(parsed);
    expect(selectUrl({ router: { location: { ...location, search: '?dialog=settings' } } }).dialog).toBe('settings');
  });
});
