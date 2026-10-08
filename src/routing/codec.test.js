import { describe, expect, it } from 'vitest';

import { VIEWS, anonymizedPath, buildUrl, driveBase, isSafeReturnUrl, locationOfUrl, parseLocation } from './codec';
import { quantizeRange } from './navigate';

const D = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const HEX_LOG = '000000dd--455f14369d';

const parse = (url) => parseLocation(locationOfUrl(url));
const base = (url) => parse(url).base;

describe('parseLocation', () => {
  it.each([
    ['/', { view: VIEWS.ROOT, dongleId: null }],
    ['/referrals', { view: VIEWS.REFERRALS, dongleId: null }],
    [`/${D}`, { view: VIEWS.DASHBOARD, dongleId: D }],
    [`/${D}/prime`, { view: VIEWS.PRIME, dongleId: D }],
    [`/${D}/stream`, { view: VIEWS.STREAM, dongleId: D }],
    [`/${D}/${LOG}`, { view: VIEWS.DRIVE, dongleId: D, drive: { logId: LOG, start: null, end: null } }],
    [`/${D}/${HEX_LOG}`, { view: VIEWS.DRIVE, drive: { logId: HEX_LOG, start: null, end: null } }],
    [`/${D}/${LOG}/556/610`, { view: VIEWS.DRIVE, drive: { logId: LOG, start: 556000, end: 610000 } }],
    [`/${D}/${LOG}/0/20`, { view: VIEWS.DRIVE, drive: { logId: LOG, start: 0, end: 20000 } }],
    [`/${D}/1000/2000`, { view: VIEWS.LEGACY_RANGE, dongleId: D, legacyRange: { start: 1000, end: 2000 } }],
    ['/demo', { view: VIEWS.DASHBOARD, dongleId: 'deadbeefdeadbeef' }],
    ['/auth/?code=x&provider=g', { view: VIEWS.AUTH }],
  ])('%s', (url, expected) => {
    expect(base(url)).toMatchObject(expected);
  });

  it.each([
    [`/prefix${D}suffix`, 'unknown-path'],
    [`/not-a-device/${LOG}`, 'unknown-path'],
    [`/${D}/prime/extra`, 'unknown-path'],
    [`/${D}/${LOG}/10`, 'unknown-path'],
    [`/${D}/${LOG}/10/20/extra`, 'unknown-path'],
    [`/${D}/${LOG}/20/10`, 'invalid-range'],
    [`/${D}/${LOG}/10/10`, 'invalid-range'],
    [`/${D}/${LOG}/-1/10`, 'invalid-range'],
    [`/${D}/${LOG}/1.5/10`, 'invalid-range'],
    [`/${D}/${LOG}/0/9007199254740991`, 'invalid-range'], // safe seconds, unsafe milliseconds
    [`/${D}/1/Infinity`, 'unknown-path'],
    [`/${D}/abc/def`, 'unknown-path'],
    [`/${D}/2000/1000`, 'invalid-range'],
    ['/nonsense/abc/def', 'unknown-path'],
    [`/${D}//prime`, 'malformed-path'],
    [`/${D}/%E0%A4%A`, 'malformed-path'],
  ])('%s is invalid (%s)', (url, reason) => {
    expect(base(url)).toMatchObject({ view: VIEWS.INVALID, reason });
  });

  it('separates commands from extensions and keeps extension order', () => {
    const location = parse(`/${D}?ci=1&pair=tok&b=2&a=1&b=3#frag`);
    expect(location.commands).toEqual({ pair: 'tok' });
    expect(location.extensions).toEqual([
      ['ci', '1'],
      ['b', '2'],
      ['a', '1'],
      ['b', '3'],
    ]);
    expect(location.hash).toBe('#frag');
  });

  it('rejects a duplicated command and keeps none of its commands', () => {
    expect(base(`/${D}?r=/a&r=/b`)).toMatchObject({ view: VIEWS.INVALID, reason: 'duplicate-query-key' });
    expect(parse(`/${D}?r=/a&r=/b&pair=x`).commands).toEqual({});
  });

  it('reads auth callback arguments only on the auth path', () => {
    expect(parse('/auth/?code=c&provider=p').commands).toEqual({ code: 'c', provider: 'p' });
    expect(parse(`/${D}?code=c`).extensions).toEqual([['code', 'c']]);
  });
});

describe('buildUrl', () => {
  it.each([
    '/',
    '/referrals',
    `/${D}`,
    `/${D}/prime`,
    `/${D}/stream`,
    `/${D}/${LOG}`,
    `/${D}/${LOG}/0/20`,
    `/${D}/${LOG}/556/610`,
    `/${D}/1000/2000`,
    `/${D}/${LOG}/10/20?pair=tok&ci=1#frag`,
  ])('round-trips %s', (url) => {
    expect(buildUrl(parse(url))).toBe(url);
    expect(parse(buildUrl(parse(url)))).toEqual(parse(url));
  });

  it.each([
    [`/${D}/`, `/${D}`],
    [`/${D}/${LOG}/010/020`, `/${D}/${LOG}/10/20`],
    ['/demo', '/deadbeefdeadbeef'],
  ])('canonicalizes %s to %s', (url, canonical) => {
    expect(buildUrl(parse(url))).toBe(canonical);
  });

  it('has no canonical form for auth or invalid locations', () => {
    expect(buildUrl(parse('/auth/?code=x'))).toBeNull();
    expect(buildUrl(parse('/nonsense'))).toBeNull();
  });

  it('refuses invalid destinations', () => {
    expect(() => buildUrl({ base: driveBase('bad', LOG), commands: {}, extensions: [] })).toThrow('invalid dongle id');
    expect(() => buildUrl({ base: driveBase(D, LOG, 1500, 3000), commands: {}, extensions: [] })).toThrow(
      'invalid drive range',
    );
    expect(() => buildUrl({ base: driveBase(D, LOG, 3000, 1000), commands: {}, extensions: [] })).toThrow(
      'invalid drive range',
    );
  });
});

describe('quantizeRange', () => {
  it.each([
    [[1234, 5678], { start: 1000, end: 6000 }],
    [[0, 20000], { start: 0, end: 20000 }],
    [[1200, 1800], { start: 1000, end: 2000 }],
    [[999, 1000], { start: 0, end: 1000 }],
  ])('rounds %j outward to whole seconds', (args, expected) => {
    expect(quantizeRange(...args)).toEqual(expected);
  });

  it.each([[[5, 5]], [[10, 5]], [[-1, 5]], [[0, NaN]], [[0, Infinity]]])('rejects %j', (args) => {
    expect(quantizeRange(...args)).toBeNull();
  });
});

describe('return targets and analytics', () => {
  it.each([
    [`/${D}/${LOG}?x=1#h`, true],
    ['/', true],
    ['//evil.example.com/x', false],
    ['/\\evil.example.com', false],
    ['https://evil.example.com', false],
    ['javascript:alert(1)', false],
    [null, false],
  ])('isSafeReturnUrl(%s)', (url, expected) => {
    expect(isSafeReturnUrl(url)).toBe(expected);
  });

  it.each([
    [`/${D}`, '/<dongleId>'],
    [`/${D}/${LOG}`, '/<dongleId>/<logId>'],
    [`/${D}/${LOG}/10/20`, '/<dongleId>/<logId>/<zoomStart>/<zoomEnd>'],
    [`/${D}/1000/2000`, '/<dongleId>/<zoomStart>/<zoomEnd>'],
    ['/', ''],
  ])('anonymizes %s', (url, expected) => {
    expect(anonymizedPath(parse(url))).toBe(expected);
  });
});

describe('edge cases', () => {
  it('rejects an auth path with an unexpected suffix', () => {
    expect(parseLocation({ pathname: '/auth/unrecognized/extra' }).base.view).toBe(VIEWS.INVALID);
    expect(parseLocation({ pathname: '/auth//' }).base.view).toBe(VIEWS.INVALID);
  });

  it('rejects an auth callback with a duplicated code', () => {
    const location = parseLocation({ pathname: '/auth/', search: '?code=first&code=second&provider=h' });
    expect(location.base.view).toBe(VIEWS.INVALID);
  });

  it('round-trips a zero start and repeated extension arguments in order', () => {
    const input = { pathname: `/${D}/${LOG}/0/20`, search: '?x=1&x=2', hash: '#keep' };
    expect(buildUrl(parseLocation(input))).toBe(`/${D}/${LOG}/0/20?x=1&x=2#keep`);
  });

  it('refuses to build a legacy range whose end precedes its start', () => {
    const legacy = { view: VIEWS.LEGACY_RANGE, dongleId: D, legacyRange: { start: 4, end: 3 } };
    expect(() => buildUrl({ base: legacy })).toThrow('invalid legacy range');
  });
});
