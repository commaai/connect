import { describe, expect, it } from 'vitest';
import { parseLocation, pathFor, locationFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('navigation URLs', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/referrals', 'referrals'], ['/auth/', 'auth'],
    ['/' + DONGLE, 'device'], ['/' + DONGLE + '/prime', 'prime'],
    ['/' + DONGLE + '/stream', 'stream'], ['/' + DONGLE + '/' + LOG, 'drive'],
    ['/' + DONGLE + '/1000/2000', 'legacy'],
  ])('parses %s as %s', (pathname, page) => {
    const navigation = parseLocation({ pathname });
    expect(navigation.page).toBe(page);
    expect(pathFor(navigation)).toBe(pathname.replace(/\/$/, '') || '/');
  });

  it('preserves zero starts and millisecond ranges', () => {
    const pathname = '/' + DONGLE + '/' + LOG + '/0/20.125';
    const navigation = parseLocation({ pathname });
    expect(navigation.range).toEqual({ start: 0, end: 20125 });
    expect(pathFor(navigation)).toBe(pathname);
  });

  it.each([
    '/not-a-device', '/x0000aaaa0000aaaa', '/' + DONGLE + 'x',
    '/' + DONGLE + '/prime/extra', '/' + DONGLE + '//' + LOG,
    '/' + DONGLE + '/' + LOG + '/-1/20', '/' + DONGLE + '/' + LOG + '/20/10',
    '/' + DONGLE + '/' + LOG + '/10/10', '/' + DONGLE + '/' + LOG + '/NaN/20',
    '/' + DONGLE + '/' + LOG + '/0/Infinity', '/' + DONGLE + '/' + LOG + '/1/2/3',
    '/' + DONGLE + '/garbage' + LOG,
  ])('rejects malformed locations without retaining a drive: %s', (pathname) => {
    expect(parseLocation({ pathname })).toMatchObject({ page: 'not-found', logId: null, range: null, dialog: null });
  });

  it.each(['settings', 'settings-uploads', 'unpair', 'pair', 'filter', 'clips'])('restores the %s dialog', (dialog) => {
    expect(parseLocation({ pathname: '/' + DONGLE, search: '?dialog=' + dialog }).dialog).toBe(dialog);
  });

  it.each(['files', 'info', 'uploads', 'clips'])('restores %s over a drive', (dialog) => {
    expect(parseLocation({ pathname: '/' + DONGLE + '/' + LOG, search: '?dialog=' + dialog }).dialog).toBe(dialog);
  });

  it.each(['switch-prime', 'cancel-prime'])('restores %s only on Prime', (dialog) => {
    expect(parseLocation({ pathname: '/' + DONGLE + '/prime', search: '?dialog=' + dialog }).dialog).toBe(dialog);
    expect(parseLocation({ pathname: '/' + DONGLE, search: '?dialog=' + dialog }).dialog).toBeNull();
  });

  it('keeps a settings target separate from the drive device', () => {
    expect(parseLocation({ pathname: '/' + DONGLE + '/' + LOG, search: '?dialog=settings&device=1111bbbb1111bbbb' }))
      .toMatchObject({ dongleId: DONGLE, logId: LOG, dialogDevice: '1111bbbb1111bbbb' });
  });

  it('preserves unrelated query parameters and the hash when closing a dialog', () => {
    const location = { pathname: '/' + DONGLE + '/' + LOG, search: '?ci=1&dialog=clip&clip=test.mp4', hash: '#video' };
    const navigation = parseLocation(location);
    expect(navigation.clip).toBe('test.mp4');
    expect(locationFor({ ...navigation, dialog: null }, location))
      .toEqual({ pathname: location.pathname, search: '?ci=1', hash: '#video' });
  });

  it('writes dialog and unrelated query parameters without URLSearchParams.size', () => {
    const descriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');
    delete URLSearchParams.prototype.size;
    try {
      const location = { pathname: '/' + DONGLE, search: '?ci=1', hash: '#device' };
      expect(locationFor({ ...parseLocation(location), dialog: 'settings' }, location))
        .toEqual({ ...location, search: '?ci=1&dialog=settings' });
    } finally {
      if (descriptor) Object.defineProperty(URLSearchParams.prototype, 'size', descriptor);
    }
  });

  it.each(['?dialog=unknown', '?dialog=clip', '?dialog=clip&clip=../bad.mp4', '?dialog=files'])('ignores invalid dialog arguments: %s', (search) => {
    expect(parseLocation({ pathname: '/' + DONGLE, search }).dialog).toBeNull();
  });
});
