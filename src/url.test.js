import { describe, expect, it } from 'vitest';

import { parseLocation, urlFor, withModal } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '0000010a--a51155e496';

const nav = (fields) => ({
  page: 'home',
  dongleId: null,
  logId: null,
  range: null,
  legacyRange: null,
  modal: null,
  modalDongleId: null,
  returnTo: null,
  ...fields,
});

function parse(url) {
  const { pathname, search } = new URL(url, 'https://connect.comma.ai');
  return parseLocation({ pathname, search });
}

describe('canonical URLs', () => {
  it.each([
    ['/', nav({})],
    ['/?r=%2F0000aaaa0000aaaa%2Fprime', nav({ returnTo: `/${DONGLE}/prime` })],
    ['/?r=%2Freferrals%3Fa%3D1%23top', nav({ returnTo: '/referrals?a=1#top' })],
    ['/referrals', nav({ page: 'referrals' })],
    [`/${DONGLE}`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/prime`, nav({ page: 'prime', dongleId: DONGLE })],
    [`/${DONGLE}/stream`, nav({ page: 'stream', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${HEX_LOG}`, nav({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG })],
    [`/${DONGLE}/${LOG}/556/610`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 556000, end: 610000 } })],
    [`/${DONGLE}/${LOG}/0/20`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } })],
    [`/${DONGLE}/${HEX_LOG}/12/42`, nav({ page: 'drive', dongleId: DONGLE, logId: HEX_LOG, range: { start: 12000, end: 42000 } })],
    [`/${DONGLE}?modal=settings`, nav({ page: 'dashboard', dongleId: DONGLE, modal: 'settings', modalDongleId: DONGLE })],
    [`/${DONGLE}/${LOG}?modal=settings&device=${OTHER}`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG, modal: 'settings', modalDongleId: OTHER })],
    [`/${DONGLE}?modal=uploads`, nav({ page: 'dashboard', dongleId: DONGLE, modal: 'uploads', modalDongleId: DONGLE })],
    [`/${DONGLE}?modal=filter`, nav({ page: 'dashboard', dongleId: DONGLE, modal: 'filter', modalDongleId: DONGLE })],
    ['/?modal=pair', nav({ modal: 'pair', modalDongleId: null })],
  ])('%s', (url, expected) => {
    expect(parse(url)).toEqual(expected);
    expect(urlFor(expected)).toBe(url);
  });
});

describe('other URLs', () => {
  it.each([
    ['/demo', nav({})],
    ['/not-a-page', nav({})],
    [`/${DONGLE.toUpperCase()}`, nav({})],
    [`/${DONGLE}/prime/extra`, nav({})],
    [`/${DONGLE}/`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}/${LOG}/10`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/20/10`, nav({ page: 'drive', dongleId: DONGLE, logId: LOG })],
    [`/${DONGLE}/${LOG}/12.5/42`, nav({})],
    [`/${DONGLE}/1564451131000/1564451191000`, nav({ page: 'dashboard', dongleId: DONGLE, legacyRange: { start: 1564451131000, end: 1564451191000 } })],
    [`/${DONGLE}?modal=unknown`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/${DONGLE}?modal=settings&device=nope`, nav({ page: 'dashboard', dongleId: DONGLE, modal: 'settings', modalDongleId: DONGLE })],
    [`/${DONGLE}?r=%2Freferrals`, nav({ page: 'dashboard', dongleId: DONGLE })],
    [`/?r=%2F${DONGLE}%2F..%2Freferrals`, nav({ returnTo: '/referrals' })],
    ['/?r=/%5Cevil.com', nav({})],
    ['/?r=//evil.com', nav({})],
    ['/?r=https://evil.com', nav({})],
    ['/?r=/%2F%2Fevil.com', nav({})],
    ['/?r=/a/..//evil.com', nav({})],
    [`/?r=${window.location.origin}//evil.com`, nav({})],
  ])('%s', (url, expected) => {
    expect(parse(url)).toEqual(expected);
  });
});

describe('urlFor', () => {
  it('omits the modal device when it is the page device', () => {
    expect(urlFor(nav({ page: 'dashboard', dongleId: DONGLE, modal: 'settings', modalDongleId: DONGLE }))).toBe(`/${DONGLE}?modal=settings`);
  });

  it('rejects a page without its device', () => {
    expect(() => urlFor(nav({ page: 'dashboard' }))).toThrow('Expected "dongleId" to be defined');
  });
});

describe('withModal', () => {
  const location = { pathname: `/${DONGLE}/${LOG}/10/20`, search: '?stripe_success=abc', hash: '#top' };

  it('opens a modal over the page, keeping the rest of the URL', () => {
    expect(withModal(location, 'settings', OTHER)).toEqual({
      pathname: `/${DONGLE}/${LOG}/10/20`, search: `?stripe_success=abc&modal=settings&device=${OTHER}`, hash: '#top',
    });
    expect(withModal(location, 'settings', DONGLE).search).toBe('?stripe_success=abc&modal=settings');
  });

  it('closes only the modal', () => {
    const open = { ...location, search: `?modal=settings&stripe_success=abc&device=${OTHER}` };
    expect(withModal(open, null)).toEqual(location);
    expect(withModal({ ...location, search: '?modal=pair' }, null).search).toBe('');
  });
});
