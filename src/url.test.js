import { describe, expect, it } from 'vitest';

import { parseUrl, buildUrl, withModal } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('parseUrl', () => {
  it.each([
    ['/', { page: 'home', dongleId: null }],
    ['/prime', { page: 'home', dongleId: null }],
    ['/auth/code/provider', { page: 'home', dongleId: null }],
    ['/referrals', { page: 'referrals', dongleId: null }],
    [`/${DONGLE}`, { page: 'device', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, range: null }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', logId: LOG, range: { start: 0, end: 20 } }],
    [`/${DONGLE}/${LOG}/10/20`, { page: 'drive', logId: LOG, range: { start: 10, end: 20 } }],
    [`/${DONGLE}/1000/2000`, { page: 'device', logId: null, legacyRange: { start: 1000, end: 2000 } }],
    [`/${DONGLE}/10`, { page: 'device', legacyRange: null }],
  ])('parses %s', (pathname, expected) => {
    expect(parseUrl(pathname)).toMatchObject(expected);
  });

  it('ignores trailing and doubled slashes', () => {
    expect(parseUrl(`//${DONGLE}//${LOG}/`)).toMatchObject({ dongleId: DONGLE, logId: LOG });
  });

  it('rejects ids that merely contain a valid id', () => {
    expect(parseUrl(`/x${DONGLE}`).dongleId).toBeNull();
    expect(parseUrl(`/${DONGLE}0`).dongleId).toBeNull();
  });

  it('reads modals from the query on top of any page', () => {
    expect(parseUrl(`/${DONGLE}/${LOG}`, `?modal=settings&device=${DONGLE}`)).toMatchObject({ page: 'drive', modal: 'settings' });
    expect(parseUrl('/referrals', `?modal=settings&device=${DONGLE}`)).toMatchObject({
      page: 'referrals', modal: 'settings', modalDongleId: DONGLE,
    });
  });

  it('ignores unknown modals and malformed devices', () => {
    expect(parseUrl(`/${DONGLE}`, '?modal=nope').modal).toBeNull();
    expect(parseUrl(`/${DONGLE}`, '?modal=settings&device=zzz').modalDongleId).toBeNull();
  });
});

describe('buildUrl', () => {
  it.each([
    [{}, '/'],
    [{ dongleId: DONGLE }, `/${DONGLE}`],
    [{ page: 'referrals' }, '/referrals'],
    [{ page: 'prime', dongleId: DONGLE }, `/${DONGLE}/prime`],
    [{ page: 'stream', dongleId: DONGLE }, `/${DONGLE}/stream`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20 } }, `/${DONGLE}/${LOG}/0/20`],
    [{ dongleId: DONGLE, modal: 'settings', modalDongleId: DONGLE }, `/${DONGLE}?modal=settings&device=${DONGLE}`],
  ])('builds %j', (input, expected) => {
    expect(buildUrl(input)).toBe(expected);
  });

  it.each([
    `/${DONGLE}`,
    `/${DONGLE}/prime`,
    `/${DONGLE}/${LOG}`,
    `/${DONGLE}/${LOG}/0/20`,
    '/referrals',
  ])('round-trips %s', (pathname) => {
    expect(buildUrl(parseUrl(pathname))).toBe(pathname);
  });
});

describe('withModal', () => {
  it('opens and closes a modal without touching the page', () => {
    const location = { pathname: `/${DONGLE}/${LOG}/5/9`, search: '' };
    const opened = withModal(location, 'settings', DONGLE);
    expect(opened).toBe(`/${DONGLE}/${LOG}/5/9?modal=settings&device=${DONGLE}`);

    const [pathname, search] = opened.split('?');
    expect(withModal({ pathname, search: `?${search}` }, null)).toBe(`/${DONGLE}/${LOG}/5/9`);
  });
});
