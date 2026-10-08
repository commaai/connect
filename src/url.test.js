import { parseLocation, pathFor, dialogLocation } from './url';

const D = '0000aaaa0000aaaa';
const L = '2026-08-06--12-00-00';
const read = (pathname, search = '') => parseLocation({ pathname, search });

describe('URL grammar', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/referrals', 'referrals'],
    [`/${D}`, 'dashboard'], [`/${D}/prime`, 'prime'], [`/${D}/stream`, 'stream'],
    [`/${D}/${L}`, 'drive'], [`/${D}/${L}/0/20`, 'drive'],
    [`/${D}/${L}/1.001/2.009`, 'drive'], [`/${D}/1000/2000`, 'dashboard'],
  ])('round-trips %s (%s)', (path, page) => {
    expect(read(path).page).toBe(page);
    expect(pathFor(read(path))).toBe(path);
  });

  it('keeps zero and exact milliseconds', () => {
    expect(read(`/${D}/${L}/0/0.001`).range).toEqual({ start: 0, end: 1 });
    expect(read(`/${D}/${L}/1.001/2.009`).range).toEqual({ start: 1001, end: 2009 });
    expect(read(`/${D}/1000/2000`).legacyRange).toEqual({ start: 1000, end: 2000 });
  });

  it.each(['-1/2', '2/1', '1/1', 'NaN/20', '1/Infinity', '1e2/200', '0x10/20', '1/9999999999999999999', '0.0001/0.0002'])('ignores unsafe range %s', (range) => {
    expect(read(`/${D}/${L}/${range}`)).toMatchObject({ page: 'drive', range: null });
  });

  it.each([`/${D}extra/${L}`, `/prefix${D}/${L}`, `//${D}/${L}`, '/unknown/prime'])('rejects malformed device paths %s', path => {
    expect(read(path).dongleId).toBeNull();
  });

  it.each([`${L}extra`, `${L}/1`, `${L}/1/2/extra`, 'prime/extra', 'stream/extra'])('does not partially match %s', suffix => {
    expect(read(`/${D}/${suffix}`)).toMatchObject({ page: 'dashboard', logId: null, range: null });
  });

  it.each(['settings', 'settings-uploads', 'pair', 'filter', 'files', 'info', 'uploads', 'clips'])('reads the %s dialog', dialog => {
    expect(read(`/${D}/${L}`, `?dialog=${dialog}`).dialog).toBe(dialog);
  });

  it('requires a drive for drive menus and a valid device for settings', () => {
    expect(read(`/${D}`, '?dialog=files').dialog).toBeNull();
    expect(read('/', '?dialog=settings').dialog).toBeNull();
    expect(read('/', `?dialog=settings&device=${D}`)).toMatchObject({ dialog: 'settings', settingsDevice: D });
    expect(read(`/${D}`, '?dialog=settings&device=bad').dialog).toBeNull();
    expect(read(`/${D}`, '?dialog=unknown').dialog).toBeNull();
  });

  it('preserves unrelated query arguments and the hash while editing dialog arguments', () => {
    const location = { pathname: `/${D}/${L}/0/20`, search: '?ci=1&r=%2Fa&dialog=settings&device=old', hash: '#point' };
    expect(dialogLocation(location, 'files')).toEqual({ pathname: location.pathname, search: '?ci=1&r=%2Fa&dialog=files', hash: '#point' });
    expect(dialogLocation(location, null)).toEqual({ pathname: location.pathname, search: '?ci=1&r=%2Fa', hash: '#point' });
  });
  it.each(['clip', 'delete-clip'])('validates %s filenames', dialog => {
    expect(read(`/${D}/${L}`, `?dialog=${dialog}&clip=drive.mp4`)).toMatchObject({ dialog, clipFilename: 'drive.mp4' });
    for (const filename of ['../secret', '/absolute', 'a/b.mp4', '']) {
      expect(read(`/${D}`, `?dialog=${dialog}&clip=${encodeURIComponent(filename)}`).dialog).toBeNull();
    }
  });
  it('limits billing dialogs to the Prime page', () => {
    expect(read(`/${D}`, '?dialog=prime-cancel').dialog).toBeNull();
    expect(read(`/${D}/prime`, '?dialog=prime-cancel').dialog).toBe('prime-cancel');
    expect(read('/referrals', '?dialog=clips').dialog).toBeNull();
  });

});
