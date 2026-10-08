import { parseLocation, driveUrl, deviceUrl, dialogUrl } from './url';
const DEVICE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL contract', () => {
  it.each([
    ['/', 'home'], ['/demo', 'demo'], ['/referrals', 'referrals'],
    [`/${DEVICE}`, 'dashboard'], [`/${DEVICE}/prime`, 'prime'], [`/${DEVICE}/stream`, 'stream'],
    [`/${DEVICE}/${LOG}`, 'drive'], [`/${DEVICE}/00000000--0000000001`, 'drive'],
    [`/${DEVICE}/1000/2000`, 'legacy'],
  ])('parses %s', (url, page) => expect(parseLocation(url).page).toBe(page));
  it.each(['NaN/20', '10/10', '20/10', '-1/20', '1/Infinity', '0/1e300', '0/20/extra'])('rejects invalid ranges %s', (range) => {
    expect(parseLocation(`/${DEVICE}/${LOG}/${range}`).page).toBe('dashboard');
  });
  it.each(['prefix0000aaaa0000aaaa', '0000aaaa0000aaaaextra', 'not-a-device'])('rejects an invalid device %s', (id) => {
    expect(parseLocation(`/${id}/${LOG}`).dongleId).toBeNull();
  });
  it('round trips zero and fractional millisecond ranges', () => {
    const url = driveUrl(DEVICE, LOG, 0, 125);
    expect(url).toBe(`/${DEVICE}/${LOG}/0/0.125`);
    expect(parseLocation(url).range).toEqual({ start: 0, end: 125 });
    expect(deviceUrl(DEVICE, 'prime')).toBe(`/${DEVICE}/prime`);
  });
  it('preserves unrelated query arguments and hashes while opening/closing overlays', () => {
    const location = { pathname: `/${DEVICE}/${LOG}`, search: '?share=hello&ci=1', hash: '#position' };
    const opened = dialogUrl(location, 'settings', DEVICE);
    const url = new URL(opened, 'https://connect.comma.ai');
    expect(parseLocation(url)).toMatchObject({ page: 'drive', dialog: 'settings', dialogDevice: DEVICE });
    expect(dialogUrl(url, null)).toBe(`${location.pathname}${location.search}${location.hash}`);
  });
  it('does not open confirmations on inappropriate pages', () => {
    expect(parseLocation({ pathname: `/${DEVICE}`, search: '?dialog=cancel-prime' }).dialog).toBeNull();
    expect(parseLocation({ pathname: '/', search: '?dialog=uploads' }).dialog).toBeNull();
    expect(parseLocation({ pathname: '/', search: '?dialog=settings&device=invalid' }).dialog).toBeNull();
  });
});
