import { parseLocation, driveUrl, dialogUrl, appReturnUrl, currentView } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const DRIVE = `/${DONGLE}/${LOG}`;

describe('navigation URLs', () => {
  it.each([
    [0, 1],
    [123, 1234],
    [9007199254739999, Number.MAX_SAFE_INTEGER],
  ])('restores exact millisecond range %s–%s from the copied URL', (start, end) => {
    const url = driveUrl(DONGLE, LOG, start, end);

    const view = parseLocation(url);

    expect(view.range).toEqual({ start, end });
  });

  it.each([0, 10])('opens copied segment %s as a whole drive', (segment) => {
    const pathname = `${DRIVE}/${segment}`;

    const view = parseLocation(pathname);

    expect(view).toMatchObject({
      page: 'drive',
      dongleId: DONGLE,
      logId: LOG,
      range: null,
      canonicalPath: pathname,
    });
  });

  it.each([
    `${DRIVE}/segment`,
    `${DRIVE}/20/10`,
    `${DRIVE}/NaN/20`,
    `${DRIVE}/0/Infinity`,
    `${DRIVE}/0/9007199254741`,
    `${DRIVE}/0/0.0001`,
    `${DRIVE}/0/20/extra`,
    `/${DONGLE}/prime/extra`,
  ])('normalizes malformed selection %s to its device dashboard', (pathname) => {
    const view = parseLocation(pathname);

    expect(view).toMatchObject({
      page: 'dashboard',
      logId: null,
      range: null,
      canonicalPath: `/${DONGLE}`,
    });
  });

  it('recognizes public drives, legacy timestamps, demo and auth without partial matches', () => {
    expect(parseLocation(DRIVE)).toMatchObject({ page: 'drive', logId: LOG });
    expect(parseLocation(`/${DONGLE}/0/2000`).legacyRange).toEqual({ start: 0, end: 2000 });
    expect(parseLocation('/demo').page).toBe('demo');
    expect(parseLocation('/auth/').page).toBe('auth');
    expect(parseLocation(`/prefix${DONGLE}`).dongleId).toBeNull();
  });

  it('keeps unrelated arguments and hashes through nested dialogs', () => {
    const location = {
      pathname: DRIVE,
      search: '?stripe_success=abc&from=0&to=100&x=y',
      hash: '#video',
    };

    const target = dialogUrl(location, 'unpair', DONGLE);

    expect(parseLocation(target)).toMatchObject({
      dialog: 'unpair',
      dialogDevice: DONGLE,
      filter: { start: 0, end: 100 },
    });

    expect(dialogUrl(target, null)).toEqual(location);
  });

  it('rejects invalid modal combinations and incomplete filters', () => {
    const unsupported = parseLocation({ pathname: DRIVE, search: '?dialog=prime-cancel&from=0' });
    const unsafeClip = parseLocation({ pathname: DRIVE, search: '?dialog=clip&clip=../bad' });
    const invalidDevice = parseLocation({ pathname: DRIVE, search: '?dialog=settings&device=invalid' });

    expect(unsupported).toMatchObject({ dialog: null, filter: null, canonicalSearch: '' });
    expect(unsafeClip.dialog).toBeNull();
    expect(invalidDevice.dialog).toBeNull();
  });

  it('accepts only local login return destinations', () => {
    expect(appReturnUrl(`${DRIVE}?x=y#video`)).toBe(`${DRIVE}?x=y#video`);
    expect(appReturnUrl('//elsewhere.example')).toBeNull();
    expect(appReturnUrl('/\\elsewhere.example')).toBeNull();
  });

  it('keeps the parsed view stable until the pathname or search changes', () => {
    const location = { pathname: DRIVE, search: '?dialog=clips', hash: '#first' };
    const state = { router: { location } };
    const view = currentView(state);

    expect(currentView({ ...state, offset: 42 })).toBe(view);

    const hashLocation = { ...location, hash: '#second' };
    expect(currentView({ router: { location: hashLocation } })).toBe(view);

    const settingsLocation = { ...location, search: '?dialog=settings' };
    const settings = currentView({ router: { location: settingsLocation } });

    expect(settings).not.toBe(view);
    expect(settings.dialog).toBe('settings');

    const dashboardLocation = { ...settingsLocation, pathname: `/${DONGLE}` };
    const dashboard = currentView({ router: { location: dashboardLocation } });

    expect(dashboard).not.toBe(settings);
  });
});
