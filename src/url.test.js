import { describe, expect, it } from 'vitest';

import { buildLocation, parentDestination, parseLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const SECOND_DEVICE = 'bbbbccccbbbbcccc';
const LOG = '2026-08-06--12-00-00';

describe('URL destinations', () => {
  it.each([
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE, logId: null, range: null, dialog: null }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, { page: 'drive', dongleId: DONGLE, logId: LOG, range: null }],
    [`/${DONGLE}/${LOG}/0/20`, { page: 'drive', logId: LOG, range: { start: 0, end: 20_000 } }],
    ['/referrals', { page: 'referrals', dongleId: null }],
    ['/auth/callback', { page: 'auth', dongleId: null }],
    ['/demo', { page: 'home', dongleId: null, logId: null, range: null, dialog: null }],
  ])('parses %s', (url, expected) => {
    expect(parseLocation(url)).toMatchObject(expected);
  });

  it.each([
    '/not-a-device/prime',
    `/${DONGLE}/10`,
    `/${DONGLE}/10/30`,
    `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/NaN/10`,
    `/${DONGLE}/${LOG}/10/20/extra`,
  ])('recovers malformed paths to a safe destination: %s', (url) => {
    expect(parseLocation(url).page).toBe(url.includes(DONGLE) ? 'dashboard' : 'home');
  });

  it('parses a legacy timestamp range without redirecting it before lookup', () => {
    const legacy = `/${DONGLE}/1786017600000/1786017660000`;
    expect(parseLocation(legacy)).toMatchObject({
      page: 'legacy',
      dongleId: DONGLE,
      range: { start: 1_786_017_600_000, end: 1_786_017_660_000 },
    });
  });

  it.each([
    ['settings', '/device?dialog=settings', { dialog: 'settings' }],
    ['settings on a second device', '/device?dialog=settings&device=target', { dialog: 'settings', dialogDeviceId: SECOND_DEVICE }],
    ['uploads', '/device/drive?dialog=uploads', { dialog: 'uploads' }],
    ['clip viewer', '/device/drive?dialog=clip&clip=my%20clip.mp4', { dialog: 'clip', clip: 'my clip.mp4' }],
    ['pairing on the root page', '/?dialog=pair', { page: 'home', dialog: 'pair' }],
  ])('parses %s', (_name, url, expected) => {
    const actualUrl = url.replace('/device/drive', `/${DONGLE}/${LOG}`).replace('/device', `/${DONGLE}`).replace('&device=target', `&device=${SECOND_DEVICE}`);
    expect(parseLocation(actualUrl)).toMatchObject(expected);
  });

  it('round-trips the destination and keeps billing return parameters', () => {
    const input = `/${DONGLE}/prime?stripe_success=session-1&dialog=prime-cancel`;
    const destination = parseLocation(input);
    const output = buildLocation(destination, input);
    expect(output).toBe(input);
    expect(parseLocation(output)).toMatchObject(destination);
  });

  it('closes nested dialogs to their parent and top-level dialogs to the page', () => {
    expect(parentDestination(parseLocation(`/${DONGLE}?dialog=settings-unpair`))).toMatchObject({
      page: 'dashboard', dialog: 'settings', dialogDeviceId: null,
    });
    expect(parentDestination(parseLocation(`/${DONGLE}/${LOG}?dialog=clip-delete&clip=x.mp4`))).toMatchObject({
      page: 'drive', dialog: 'clips', clip: null,
    });
  });

  it('removes unknown dialogs while preserving unrelated query parameters', () => {
    const destination = parseLocation(`/${DONGLE}?source=share&dialog=unknown`);
    expect(destination.canonicalPath).toBe(`/${DONGLE}?source=share`);
  });
});
