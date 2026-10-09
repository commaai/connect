import { describe, expect, it } from 'vitest';

import { parseURL } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

const destinations = [
  ['root', '/', { page: 'root' }],
  ['auth', '/auth', { page: 'auth' }],
  ['demo', '/demo', { page: 'demo' }],
  ['referrals', '/referrals', { page: 'referrals' }],
  ['dashboard', `/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
  ['Prime', `/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
  ['stream', `/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
  ['whole drive', `/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, range: null }],
  ['drive range', `/${DONGLE}/${LOG}/10/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 } }],
  ['zero-start range', `/${DONGLE}/${LOG}/0/20`, { page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 0, end: 20000 } }],
];

describe('parseURL', () => {
  it.each(destinations)('parses %s: %s', (_name, pathname, destination) => {
    expect(parseURL({ pathname })).toEqual(destination);
  });

  it('parses legacy timestamps as milliseconds', () => {
    expect(parseURL({ pathname: `/${DONGLE}/1000/2000` })).toEqual({
      page: 'legacy-drive', dongleId: DONGLE, range: { start: 1000, end: 2000 }
    });
  });

  it.each([
    [`/${DONGLE}/${LOG}/ten/20`],
    [`/${DONGLE}/${LOG}/20/10`],
    [`/${DONGLE}/${LOG}/9007199254741/9007199254742`],
    [`/${DONGLE}/${LOG}/${'9'.repeat(400)}/${'9'.repeat(401)}`],
  ])('falls back to the whole drive for an invalid range: %s', (pathname) => {
    expect(parseURL({ pathname })).toEqual({
      page: 'drive', dongleId: DONGLE, logId: LOG, range: null,
    });
  });

  it.each([
    '/not-a-device',
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/${LOG}/10`,
    `/${DONGLE}/20/10`,
    `/${DONGLE}/10/10`,
    `/${DONGLE}/9007199254740992/9007199254740993`,
  ])('rejects %s', (pathname) => {
    expect(parseURL({ pathname })).toEqual({ page: 'not-found' });
  });

  it('parses settings independently of the background device', () => {
    const settingsDongleId = '1111bbbb1111bbbb';
    expect(parseURL({ pathname: `/${DONGLE}/${LOG}/10/20`, search: `?settings=${settingsDongleId}`})).toEqual({
      page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 }, settingsDongleId
    });
  });
});
