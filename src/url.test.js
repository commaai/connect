import { describe, expect, it } from 'vitest';
import { destinationFromUrl, urlForDestination } from './url';
import { DEMO_DONGLE_ID } from './api/demo';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const destination = (kind, dongleId = null, logId = null, start = null, end = null) => ({ kind, dongleId, logId, start, end });
const cases = [
  ['/', destination('root')],
  ['/referrals', destination('referrals')],
  ['/auth', destination('auth')],
  [`/${DONGLE}`, destination('dashboard', DONGLE)],
  [`/${DEMO_DONGLE_ID}`, destination('dashboard', DEMO_DONGLE_ID)],
  ...['settings', 'prime', 'stream'].map((kind) => [`/${DONGLE}/${kind}`, destination(kind, DONGLE)]),
  [`/${DONGLE}/${LOG}`, destination('drive', DONGLE, LOG)],
  [`/${DONGLE}/${LOG}/0/20`, destination('drive', DONGLE, LOG, 0, 20000)],
  [`/${DONGLE}/10/20`, destination('legacy', DONGLE, null, 10, 20)],
];

describe('destinations', () => {
  it.each(cases)('parses and round trips %s', (pathname, expected) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
    expect(urlForDestination(expected)).toBe(pathname);
  });

  it.each(['/demo', `/x${DONGLE}`, `/${DONGLE}a`, `/${DONGLE}/prime/extra`, `/${DONGLE}/${LOG}a`, `/${DONGLE}/1/no`, `/${DONGLE}/20/10`, `/${DONGLE}/${LOG}/1/2/extra`])('rejects %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual(destination('not-found'));
  });

  it.each([
    [`/${DONGLE}/${LOG}/1.5/20`, destination('drive', DONGLE, LOG, 1500, 20000), `/${DONGLE}/${LOG}/1/20`],
    [`/${DONGLE}/1.5/20.5`, destination('legacy', DONGLE, null, 1.5, 20.5), `/${DONGLE}/1.5/20.5`],
  ])('preserves fractional bounds from %s', (pathname, expected, canonical) => {
    expect(destinationFromUrl(pathname)).toEqual(expected);
    expect(urlForDestination(expected)).toBe(canonical);
  });

  it('round trips a sub-second selection to enclosing whole seconds', () => {
    const pathname = urlForDestination(destination('drive', DONGLE, LOG, 10000, 10500));
    expect(pathname).toBe(`/${DONGLE}/${LOG}/10/11`);
    expect(destinationFromUrl(pathname)).toEqual(destination('drive', DONGLE, LOG, 10000, 11000));
  });

  it.each(cases)('ignores trailing and repeated slashes in %s', (pathname, expected) => {
    expect(destinationFromUrl(`${pathname.replaceAll('/', '//')}//`)).toEqual(expected);
  });

  it.each(['/auth/', '/auth/code/provider', '//auth//callback/'])('recognizes auth path %s', (pathname) => {
    expect(destinationFromUrl(pathname)).toEqual(destination('auth'));
  });

  it.each(['20/10', '10/10', '-1/20', 'Infinity/20', 'no/20'])('ignores invalid drive range %s', (range) => {
    expect(destinationFromUrl(`/${DONGLE}/${LOG}/${range}`)).toEqual(destination('drive', DONGLE, LOG));
  });
});
