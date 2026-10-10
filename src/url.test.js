import { describe, expect, it } from 'vitest';
import { parseRoute, buildUrl, parseQuery, ROUTES } from './url';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

describe('route schema', () => {
  it.each([
    ['/', ROUTES.HOME], ['/demo', ROUTES.DEMO], ['/referrals', ROUTES.REFERRALS], ['/auth/', ROUTES.AUTH],
    [`/${DONGLE}`, ROUTES.DEVICE], [`/${DONGLE}/settings`, ROUTES.SETTINGS],
    [`/${DONGLE}/prime`, ROUTES.PRIME], [`/${DONGLE}/stream`, ROUTES.STREAM],
    [`/${DONGLE}/${LOG}`, ROUTES.DRIVE], [`/${DONGLE}/0000010a--a51155e496`, ROUTES.DRIVE],
    [`/${DONGLE}/1000/2000`, ROUTES.LEGACY],
  ])('recognizes %s', (pathname, type) => {
    const route = parseRoute({ pathname });
    expect(route.type).toBe(type);
    expect(parseRoute(buildUrl(route))).toEqual(route);
  });

  it.each(['/missing', '/abcdefghijklmnop', '/0000aaaa0000aaaa-extra',
    `/${DONGLE}/prime/extra`, `/${DONGLE}/${LOG}/NaN/20`, `/${DONGLE}/${LOG}/20/10`,
    `/${DONGLE}/${LOG}/-1/20`, `/${DONGLE}/10/20/ignored`, `/${DONGLE}/${LOG}/10/Infinity`, `/${DONGLE}/${LOG}/1e2/200`, `/${DONGLE}/${LOG}/1.0001/20`])(
    'rejects unknown or malformed route %s', (pathname) => expect(parseRoute({ pathname })).toBeNull(),
  );

  it('round-trips zero and fractional seconds without dropping a range', () => {
    const route = parseRoute({ pathname: `/${DONGLE}/${LOG}/0/20.125` });
    expect(route.zoom).toEqual({ start: 0, end: 20125 });
    expect(buildUrl(route)).toBe(`/${DONGLE}/${LOG}/0/20.125`);
  });

  it('preserves exact millisecond boundaries', () => {
    expect(parseRoute(`/${DONGLE}/${LOG}/1.001/2.003`).zoom).toEqual({ start: 1001, end: 2003 });
  });

  it.each(['demo', 'deadbeefdeadbeef'])('preserves demo device route %s', (prefix) => {
    expect(parseRoute(`/${prefix}/00000000--0000000001/0/20`)).toMatchObject({
      type: ROUTES.DRIVE, dongleId: 'deadbeefdeadbeef', logId: '00000000--0000000001',
      zoom: { start: 0, end: 20000 },
    });
  });

  it('preserves modal, pairing, redirect, zoom, and Stripe query data', () => {
    const query = { modal: 'uploads', pair: 'token', r: '/referrals', zoom: '10', stripe_success: '1', stripe_cancelled: '0' };
    const url = new URL(buildUrl({ dongleId: DONGLE, type: ROUTES.PRIME, query }), 'https://connect.comma.ai');
    expect(parseRoute(url).query).toEqual(query);
    expect(parseQuery('?code=abc&provider=github')).toEqual({ code: 'abc', provider: 'github' });
  });
});
