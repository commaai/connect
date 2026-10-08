import { describe, expect, it } from 'vitest';

import {
  dialogUrl,
  parseLocation,
  getDongleID,
  getZoom,
  getRouteId,
  getRouteZoom,
  getPrimeNav,
  getStreamNav,
} from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('URL pathname helpers', () => {
  it.each([
    [`/${DONGLE}`, DONGLE],
    [`/${DONGLE}/${LOG}`, DONGLE],
    ['/', null],
    ['/prime', null],
  ])('getDongleID(%s)', (pathname, expected) => {
    expect(getDongleID(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/10/20`, { start: 10, end: 20 }],
    [`/${DONGLE}/0/20/ignored`, null],
    [`/${DONGLE}/${LOG}/10/20`, null],
    [`/${DONGLE}/10`, null],
    ['/auth/code/provider', null],
  ])('getZoom(%s)', (pathname, expected) => {
    expect(getZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, LOG],
    [`/${DONGLE}/${LOG}/10/20`, LOG],
    [`/${DONGLE}/prime`, null],
    [`/${DONGLE}`, null],
  ])('getRouteId(%s)', (pathname, expected) => {
    expect(getRouteId(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/556/610`, { start: 556000, end: 610000 }],
    [`/${DONGLE}/${LOG}/0/20`, { start: 0, end: 20000 }],
    [`/${DONGLE}/10/20`, null],
  ])('getRouteZoom(%s)', (pathname, expected) => {
    expect(getRouteZoom(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}/prime`, true],
    [`/${DONGLE}/prime/extra`, false],
    ['/not-a-device/prime', false],
    [`/${DONGLE}/stream`, false],
  ])('getPrimeNav(%s)', (pathname, expected) => {
    expect(getPrimeNav(pathname)).toBe(expected);
  });

  it.each([
    [`/${DONGLE}/stream`, true],
    [`/${DONGLE}/stream/extra`, false],
    ['/not-a-device/stream', false],
    [`/${DONGLE}/prime`, false],
  ])('getStreamNav(%s)', (pathname, expected) => {
    expect(getStreamNav(pathname)).toBe(expected);
  });

  it('parses directly addressable dialogs from query state', () => {
    expect(parseLocation({ pathname: `/${DONGLE}`, search: `?dialog=settings&device=${DONGLE}` })).toMatchObject({
      page: 'dashboard',
      dialog: 'settings',
      dialogDevice: DONGLE,
    });
    expect(parseLocation({ pathname: `/${DONGLE}/${LOG}`, search: '?dialog=uploads' })).toMatchObject({
      page: 'drive',
      dialog: 'uploads',
    });
    expect(parseLocation({ pathname: `/${DONGLE}`, search: '?dialog=uploads' }).dialog).toBeNull();
  });

  it('adds and removes dialogs while preserving unrelated query and hash state', () => {
    const location = { pathname: `/${DONGLE}`, search: '?foo=bar', hash: '#clip' };
    const opened = dialogUrl(location, 'settings', DONGLE);
    expect(opened).toBe(`/${DONGLE}?foo=bar&dialog=settings&device=${DONGLE}#clip`);
    expect(dialogUrl({ pathname: `/${DONGLE}`, search: `?foo=bar&dialog=settings&device=${DONGLE}`, hash: '#clip' }, null))
      .toBe(`/${DONGLE}?foo=bar#clip`);
  });
});
