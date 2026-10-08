import { describe, expect, it } from 'vitest';

import { dialogUrl, formatSeconds, parseUrl } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const NONE = { dongleId: null, page: null, logId: null, zoom: null, legacyZoom: null, dialog: null, clip: null };

describe('parseUrl', () => {
  it.each([
    ['/', NONE],
    ['/referrals', { ...NONE, page: 'referrals' }],
    [`/${DONGLE}`, { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}/`, { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { ...NONE, dongleId: DONGLE, page: 'prime' }],
    [`/${DONGLE}/stream`, { ...NONE, dongleId: DONGLE, page: 'stream' }],
    [`/${DONGLE}/${LOG}`, { ...NONE, dongleId: DONGLE, logId: LOG }],
    [`/${DONGLE}/${LOG}/556/610`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${LOG}/0/20`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 0, end: 20000 } }],
    [`/${DONGLE}/${LOG}/10.5/20.25`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 10500, end: 20250 } }],
    [`/${DONGLE}/${LOG}/0.001/0.002`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 1, end: 2 } }],
    [`/${DONGLE}/${LOG}/010.000/20`, { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }],
    [`/${DONGLE}/1000/2000`, { ...NONE, dongleId: DONGLE, legacyZoom: { start: 1000, end: 2000 } }],
  ])('parses %s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    [`/${DONGLE}`, '?dialog=settings', { ...NONE, dongleId: DONGLE, dialog: 'settings' }],
    [`/${DONGLE}/${LOG}/10/20`, '?dialog=uploads', { ...NONE, dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 }, dialog: 'uploads' }],
    [`/${DONGLE}`, '?dialog=clips&clip=a.mp4', { ...NONE, dongleId: DONGLE, dialog: 'clips', clip: 'a.mp4' }],
    [`/${DONGLE}`, '?dialog=filter&clip=a.mp4', { ...NONE, dongleId: DONGLE, dialog: 'filter' }],
    [`/${DONGLE}`, '?dialog=clips&clip=', { ...NONE, dongleId: DONGLE, dialog: 'clips' }],
    ['/', '?dialog=add-device', { ...NONE, dialog: 'add-device' }],
    [`/${DONGLE}`, '?ci=1', { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}`, '?settings', { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}`, '?dialog=unpair', { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}`, '?dialog=__proto__', { ...NONE, dongleId: DONGLE }],
    [`/${DONGLE}`, '?dialog=settings&dialog=unpair', { ...NONE, dongleId: DONGLE, dialog: 'settings' }],
    ['/referrals', '?dialog=settings', { ...NONE, page: 'referrals', dialog: 'settings' }],
  ])('parses %s%s', (pathname, search, expected) => {
    expect(parseUrl(pathname, search)).toEqual(expected);
  });

  it.each([
    [{ pathname: '/d/l', search: '', hash: '' }, ['settings'], '/d/l?dialog=settings'],
    [{ pathname: '/d', search: '?ci=1', hash: '#top' }, ['clips', 'a b.mp4'], '/d?ci=1&dialog=clips&clip=a+b.mp4#top'],
    [{ pathname: '/d', search: '?dialog=clips&clip=a.mp4&ci=1', hash: '' }, ['clips'], '/d?ci=1&dialog=clips'],
    [{ pathname: '/d', search: '?dialog=settings', hash: '#x' }, [null], '/d#x'],
  ])('builds the URL of %o with dialog %j', (location, args, expected) => {
    expect(dialogUrl(location, ...args)).toBe(expected);
    expect(parseUrl(location.pathname, expected.slice(location.pathname.length).split('#')[0])).toMatchObject({
      dialog: args[0], clip: args[1] ?? null,
    });
  });

  it.each([
    [`/${DONGLE}/${LOG}/20/10`, 'a reversed range'],
    [`/${DONGLE}/${LOG}/20/20`, 'an empty range'],
    [`/${DONGLE}/${LOG}/-10/20`, 'a negative start'],
    [`/${DONGLE}/${LOG}/1e3/2000`, 'an exponent'],
    [`/${DONGLE}/${LOG}/NaN/20`, 'NaN'],
    [`/${DONGLE}/${LOG}/10`, 'a missing end'],
    [`/${DONGLE}/${LOG}/1/${'9'.repeat(400)}`, 'an end too long to be a number'],
    [`/${DONGLE}/${LOG}/1/9007199254740.992`, 'an end past the safe integers in milliseconds'],
    [`/${DONGLE}/${LOG}/1/9007199254741`, 'an end past the safe integers in whole seconds'],
    [`/${DONGLE}/${LOG}/10.1234/20`, 'more than millisecond decimals'],
    [`/${DONGLE}/${LOG}/10./20`, 'a trailing point'],
    [`/${DONGLE}/${LOG}/.5/20`, 'a leading point'],
    [`/${DONGLE}/${LOG}/0x10/20`, 'hex'],
    [`/${DONGLE}/${LOG}/+10/20`, 'a sign'],
    [`/${DONGLE}/${LOG}/10.5/10.5`, 'an empty subsecond range'],
    [`/${DONGLE}/${LOG}/10.6/10.5`, 'a reversed subsecond range'],
  ])('opens the whole drive for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ ...NONE, dongleId: DONGLE, logId: LOG });
  });

  it('keeps the largest safe drive range', () => {
    expect(parseUrl(`/${DONGLE}/${LOG}/0/9007199254740.991`).zoom).toEqual({ start: 0, end: Number.MAX_SAFE_INTEGER });
  });

  it.each([1, 999, 1000, 1001, 10500, 59999, 60000, 3_600_000.4, Number.MAX_SAFE_INTEGER])(
    'reads back %s milliseconds formatted as seconds',
    (ms) => {
      expect(parseUrl(`/${DONGLE}/${LOG}/0/${formatSeconds(ms)}`).zoom).toEqual({ start: 0, end: Math.round(ms) });
    },
  );

  it.each([[10500, '10.5'], [10050, '10.05'], [10005, '10.005'], [10000, '10'], [0, '0'], [999.6, '1']])(
    'formats %s milliseconds as %s seconds',
    (ms, seconds) => {
      expect(formatSeconds(ms)).toBe(seconds);
    },
  );

  it('keeps the largest safe legacy range', () => {
    expect(parseUrl(`/${DONGLE}/1/9007199254740991`).legacyZoom).toEqual({ start: 1, end: 9007199254740991 });
  });

  it.each([
    [`/x${DONGLE}`], [`/${DONGLE}0`], [`/${DONGLE.toUpperCase()}`], ['/auth/code/provider'], ['/referrals/extra'],
  ])('names no device for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual(NONE);
  });

  it.each([
    [`/${DONGLE}/prime/extra`], [`/${DONGLE}/settings`], [`/${DONGLE}/garbage`], [`/${DONGLE}/10/20/30`],
    [`/${DONGLE}/1/${'9'.repeat(400)}`], [`/${DONGLE}/1/9007199254740992`],
  ])('selects only the device for %s', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ ...NONE, dongleId: DONGLE });
  });
});
