import { describe, expect, it } from 'vitest';

import {
  analyticsPath, build, historyLocationMatches, inheritPassthrough, parent, parse,
} from './location';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function roundTrip(pathname, search = '') {
  const location = parse({ pathname, search });
  const built = build(location);
  expect(built).toEqual({ pathname: built.pathname, search: built.search });
  expect(parse(built)).toEqual(location);
  return location;
}

describe('parse and build', () => {
  it('parses OAuth return values off the auth kind', () => {
    const location = roundTrip('/auth/', '?code=abc&provider=g&state=s');
    expect(location.kind).toBe('auth');
    expect(location).toMatchObject({ code: 'abc', provider: 'g', state: 's' });
    expect(build(location).search).toBe('?code=abc&provider=g&state=s');
  });

  it.each([
    ['/', 'root', {}],
    ['/referrals', 'referrals', {}],
    ['/auth/', 'auth', { code: null, provider: null, state: null }],
    ['/auth/code/provider', 'auth', { code: null, provider: null, state: null }],
    ['/demo', 'demo', {}],
    ['/deadbeefdeadbeef', 'device', { dongleId: 'deadbeefdeadbeef' }],
    [`/${DONGLE}`, 'device', { dongleId: DONGLE }],
    [`/${DONGLE}/prime`, 'prime', { dongleId: DONGLE, stripeCancelled: null, stripeSuccess: null }],
    [`/${DONGLE}/stream`, 'stream', { dongleId: DONGLE }],
    [`/${DONGLE}/settings`, 'settings', { dongleId: DONGLE }],
    [`/${DONGLE}/${LOG}`, 'drive', { dongleId: DONGLE, logId: LOG, zoom: null, query: {} }],
    [`/${DONGLE}/0000010a--a51155e496`, 'drive', { logId: '0000010a--a51155e496' }],
    [`/${DONGLE}/00000000--0000000001`, 'drive', { logId: '00000000--0000000001' }],
  ])('parses %s as %s', (pathname, kind, payload) => {
    const location = roundTrip(pathname);
    expect(location.kind).toBe(kind);
    expect(location).toMatchObject(payload);
  });

  it('keeps a ranged drive zoom in milliseconds, including second zero', () => {
    const location = roundTrip(`/${DONGLE}/${LOG}/0/20`);
    expect(location.kind).toBe('drive');
    expect(location.zoom).toEqual({ start: 0, end: 20000 });
    expect(build(location).pathname).toBe(`/${DONGLE}/${LOG}/0/20`);
  });

  it('parses a zoom whose seconds are both zero', () => {
    const location = roundTrip(`/${DONGLE}/${LOG}/0/0`);
    expect(location.zoom).toEqual({ start: 0, end: 0 });
  });

  it('parses a legacy unix-millisecond range without scaling it', () => {
    const location = roundTrip(`/${DONGLE}/1000/2000`);
    expect(location.kind).toBe('legacy');
    expect(location).toMatchObject({ startMs: 1000, endMs: 2000 });
  });

  it('drops unknown query keys: the drive query record is the declared extension slot', () => {
    const location = parse({ pathname: `/${DONGLE}/${LOG}`, search: '?modal=uploads' });
    expect(location.kind).toBe('drive');
    expect(location.passthrough).toEqual({ pair: null, r: null, ci: null });
    expect(build(location).search).toBe('');
  });

  it('canonicalizes a trailing slash', () => {
    expect(build(parse({ pathname: `/${DONGLE}/` }))).toEqual({ pathname: `/${DONGLE}`, search: '' });
  });
});

describe('search', () => {
  it('declares stripe fields on prime only, in a fixed order, as raw strings', () => {
    const location = parse({ pathname: `/${DONGLE}/prime`, search: '?stripe_success=cs_test&stripe_cancelled=1' });
    expect(location.stripeSuccess).toBe('cs_test');
    expect(location.stripeCancelled).toBe('1');
    expect(build(location).search).toBe('?stripe_cancelled=1&stripe_success=cs_test');
  });

  it('carries passthrough keys decoded, in a fixed order', () => {
    const location = parse({ pathname: `/${DONGLE}/prime`, search: '?pair=jwt&ci=1&r=%2Fx' });
    expect(location.passthrough.r).toBe('/x');
    expect(build(location).search).toBe('?pair=jwt&r=%2Fx&ci=1');
  });

  it('round-trips an empty query as an empty string', () => {
    expect(build(parse({ pathname: `/${DONGLE}` }))).toEqual({ pathname: `/${DONGLE}`, search: '' });
  });
});

describe('rejections', () => {
  it.each([
    ['/0000aaaa0000aaa', 'device id too short'],
    ['/0000aaaa0000aaaa0', 'device id too long'],
    [`/${DONGLE}/2026-08-06--12-00-0`, 'log id too short'],
    [`/${DONGLE}/2026-08-06--12-00-000`, 'log id too long'],
    [`/${DONGLE}/${LOG}/01/20`, 'leading zero'],
    [`/${DONGLE}/${LOG}/1.5/20`, 'fractional second'],
    [`/${DONGLE}/${LOG}/-1/20`, 'negative second'],
    [`/${DONGLE}/${LOG}/10`, 'zoom with only a start'],
    [`/${DONGLE}/${LOG}/10/20/extra`, 'extra segment'],
    [`/${DONGLE}/prime/extra`, 'prime with an extra segment'],
    [`/${DONGLE}/referrals`, 'referrals is not a device sub-path'],
    ['/not-a-device/prime', 'not a device'],
  ])('treats %s (%s) as unknown', (pathname) => {
    const location = parse({ pathname });
    expect(location.kind).toBe('unknown');
    expect(location.pathname).toBe(pathname);
  });

  it.each([
    [`/${DONGLE}/prime`, 'prime'],
    [`/${DONGLE}/stream`, 'stream'],
    [`/${DONGLE}/settings`, 'settings'],
    ['/referrals', 'referrals'],
    ['/auth/', 'auth'],
    ['/demo', 'demo'],
  ])('reserved word %s wins over the log-id rule', (pathname, kind) => {
    expect(parse({ pathname }).kind).toBe(kind);
  });
});

describe('inheritPassthrough', () => {
  it('keeps ci on an in-app push and drops another kind\'s declared keys', () => {
    const current = parse({ pathname: `/${DONGLE}/prime`, search: '?ci=1&stripe_success=cs_test' });
    const next = inheritPassthrough({ kind: 'device', dongleId: DONGLE }, current);
    expect(build(next).search).toBe('?ci=1');
  });

  it('does not invent keys that were never present', () => {
    const current = parse({ pathname: `/${DONGLE}` });
    const next = inheritPassthrough({ kind: 'drive', dongleId: DONGLE, logId: LOG, zoom: null, query: {} }, current);
    expect(build(next).search).toBe('');
  });
});

describe('parent', () => {
  it('goes from a zoom to the whole drive', () => {
    const location = parse({ pathname: `/${DONGLE}/${LOG}/10/20` });
    expect(build(parent(location)).pathname).toBe(`/${DONGLE}/${LOG}`);
  });

  it.each([
    ['prime', `/${DONGLE}`],
    ['stream', `/${DONGLE}`],
    ['settings', `/${DONGLE}`],
  ])('goes from %s to the device dashboard', (kind, expected) => {
    const location = parse({ pathname: `/${DONGLE}/${kind}` });
    expect(build(parent(location)).pathname).toBe(expected);
  });

  it('goes from a whole drive to the device dashboard', () => {
    const location = parse({ pathname: `/${DONGLE}/${LOG}` });
    expect(build(parent(location)).pathname).toBe(`/${DONGLE}`);
  });

  it('goes from a legacy range to the device dashboard', () => {
    const location = parse({ pathname: `/${DONGLE}/1000/2000` });
    expect(build(parent(location)).pathname).toBe(`/${DONGLE}`);
  });

  it('goes from demo to the demo device, not /demo', () => {
    expect(build(parent(parse({ pathname: '/demo' }))).pathname).toBe('/deadbeefdeadbeef');
  });

  it('roots out from referrals, root, auth, and unknown', () => {
    for (const pathname of ['/referrals', '/', '/auth/', `/${DONGLE}/prime/extra`]) {
      expect(build(parent(parse({ pathname }))).pathname).toBe('/');
    }
  });
});

describe('analyticsPath', () => {
  it.each([
    [`/${DONGLE}`, `/<dongleId>`],
    ['/demo', '/demo'],
    [`/${DONGLE}/${LOG}`, `/<dongleId>/${LOG}`],
    [`/${DONGLE}/${LOG}/10/20`, `/<dongleId>/${LOG}/10/20`],
    [`/${DONGLE}/1000/2000`, '/<dongleId>/1000/2000'],
    [`/${DONGLE}/prime`, '/<dongleId>/prime'],
    [`/${DONGLE}/stream`, '/<dongleId>/stream'],
    [`/${DONGLE}/settings`, '/<dongleId>/settings'],
    ['/referrals', '/referrals'],
    ['/auth/', '/auth'],
    ['/', ''],
  ])('templates %s as %s', (pathname, expected) => {
    expect(analyticsPath(parse({ pathname }))).toBe(expected);
  });

  it('redacts only a leading dongle segment on unknown paths', () => {
    expect(analyticsPath(parse({ pathname: `/${DONGLE}/prime/extra` }))).toBe('/<dongleId>/prime/extra');
    expect(analyticsPath(parse({ pathname: '/junk/path/here' }))).toBe('/junk/path/here');
  });

  it('never includes the search string', () => {
    const location = parse({ pathname: `/${DONGLE}/prime`, search: '?stripe_success=cs_test&pair=jwt' });
    expect(analyticsPath(location)).toBe('/<dongleId>/prime');
  });
});

describe('historyLocationMatches', () => {
  it('matches pathname and normalized search', () => {
    expect(historyLocationMatches(
      { pathname: `/${DONGLE}`, search: '' },
      { pathname: `/${DONGLE}`, search: '' },
    )).toBe(true);
    expect(historyLocationMatches(
      { pathname: `/${DONGLE}`, search: undefined },
      { pathname: `/${DONGLE}`, search: '' },
    )).toBe(true);
    expect(historyLocationMatches(
      { pathname: `/${DONGLE}`, search: '?ci=1' },
      { pathname: `/${DONGLE}`, search: '' },
    )).toBe(false);
    expect(historyLocationMatches(
      { pathname: `/${DONGLE}`, search: '?ci=1' },
      { pathname: `/${DONGLE}`, search: '?ci=1' },
    )).toBe(true);
  });
});
