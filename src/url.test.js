import { parseLocation, urlFor, modalLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL grammar', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/referrals', 'referrals'], ['/auth/', 'auth'],
    [`/${DONGLE}`, 'dashboard'], [`/${DONGLE}/prime`, 'prime'], [`/${DONGLE}/stream`, 'stream'],
    [`/${DONGLE}/${LOG}`, 'drive'], [`/${DONGLE}/0000010a--a51155e496`, 'drive'],
    [`/${DONGLE}/1000/2000`, 'legacy'],
  ])('parses %s as %s', (pathname, page) => {
    expect(parseLocation({ pathname }).page).toBe(page);
  });

  it.each([
    '/not-a-device/prime', `/${DONGLE}extra`, `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`, `/${DONGLE}/${LOG}/10/20/extra`,
    `/${DONGLE}/${LOG}/-1/20`, `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/10/10`, `/${DONGLE}/${LOG}/NaN/20`,
    `/${DONGLE}/${LOG}/0/Infinity`, `/${DONGLE}/${LOG}/0/1e3`,
    `/${DONGLE}/0x10/20`, `/${DONGLE}/10/20/ignored`,
    `/${DONGLE}/prefix${LOG}`, `/${DONGLE}/${LOG}/0/${'9'.repeat(310)}`,
  ])('rejects malformed path %s', (pathname) => {
    expect(parseLocation({ pathname })).toMatchObject({ page: 'not-found', logId: null, zoom: null, legacy: null });
  });

  it.each([[0, 20000], [123, 1234], [10000, 20000]])('round trips a range from %s to %s ms', (start, end) => {
    const location = { dongleId: DONGLE, logId: LOG, zoom: { start, end } };
    expect(parseLocation({ pathname: urlFor(location) })).toMatchObject(location);
  });

  it('keeps route ranges separate from legacy timestamps', () => {
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}/0/20` })).toMatchObject({ zoom: { start: 0, end: 20000 }, legacy: null });
    expect(parseLocation({ pathname: `/${DONGLE}/1000/2000` })).toMatchObject({ zoom: null, legacy: { start: 1000, end: 2000 } });
  });

  it('changes only the modal query parameters', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/0/20`, search: '?ci=1', hash: '#position' };
    const opened = modalLocation(location, 'settings', DONGLE);
    expect(parseLocation(opened)).toMatchObject({ modal: 'settings', modalDevice: DONGLE });
    expect(modalLocation(opened, null)).toEqual(location);
    expect(parseLocation({ search: '?modal=unknown&device=bad' })).toMatchObject({ modal: null, modalDevice: null });
  });

  it('round trips a clip filename and clears it when leaving the clip dialog', () => {
    const location = { pathname: `/${DONGLE}`, search: '?ci=1', hash: '' };
    const opened = modalLocation(location, 'clip-delete', null, 'road clip.mp4');
    expect(parseLocation(opened)).toMatchObject({ modal: 'clip-delete', clip: 'road clip.mp4' });
    expect(modalLocation(opened, 'clips').search).toBe('?ci=1&modal=clips');
    expect(modalLocation(opened, null)).toEqual(location);
  });
});
