import { describe, expect, it } from 'vitest';

import { parseUrl, urlFor } from './url';

const DONGLE = '0000aaaa0000aaaa';
const NEW_LOG = '0000010a--a51155e496';
const DEMO_LOG = '00000000--0000000001';
const OLD_LOG = '2024-01-02--10-20-30';

describe('parseUrl', () => {
  it.each([
    ['/', { page: 'root' }],
    ['/referrals', { page: 'referrals' }],
    [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/`, { page: 'dashboard', dongleId: DONGLE }],
    [`/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    [`/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
    [`/${DONGLE}/settings`, { page: 'settings', dongleId: DONGLE }],
    [`/${DONGLE}/${NEW_LOG}`, { page: 'drive', dongleId: DONGLE, logId: NEW_LOG }],
    [`/${DONGLE}/${DEMO_LOG}`, { page: 'drive', dongleId: DONGLE, logId: DEMO_LOG }],
    [`/${DONGLE}/${OLD_LOG}`, { page: 'drive', dongleId: DONGLE, logId: OLD_LOG }],
    [`/${DONGLE}/${NEW_LOG}/556/610`, { page: 'drive', dongleId: DONGLE, logId: NEW_LOG, zoom: { start: 556000, end: 610000 } }],
    [`/${DONGLE}/${NEW_LOG}/0/30`, { page: 'drive', dongleId: DONGLE, logId: NEW_LOG, zoom: { start: 0, end: 30000 } }],
    [`/${DONGLE}/1700000000000/1700000060000`, { page: 'legacy', dongleId: DONGLE, zoom: { start: 1700000000000, end: 1700000060000 } }],
  ])('%s', (pathname, expected) => {
    expect(parseUrl(pathname)).toEqual(expected);
  });

  it.each([
    '/demo',
    '/auth',
    '/not-a-device',
    `/${DONGLE.toUpperCase()}`,
    `/x${DONGLE}`,
    `/${DONGLE}/prime/extra`,
    `/${DONGLE}/unknown`,
    `/${DONGLE}/${NEW_LOG}/10`,
    `/${DONGLE}/${NEW_LOG}/30/10`,
    `/${DONGLE}/${NEW_LOG}/10/10`,
    `/${DONGLE}/${NEW_LOG}/1.5/20`,
    `/${DONGLE}/${NEW_LOG}/-1/20`,
    `/${DONGLE}/${NEW_LOG}/10/20/extra`,
  ])('%s is not a known page', (pathname) => {
    expect(parseUrl(pathname)).toEqual({ page: 'root' });
  });
});

describe('urlFor', () => {
  it.each([
    { page: 'root' },
    { page: 'referrals' },
    { page: 'dashboard', dongleId: DONGLE },
    { page: 'prime', dongleId: DONGLE },
    { page: 'stream', dongleId: DONGLE },
    { page: 'settings', dongleId: DONGLE },
    { page: 'drive', dongleId: DONGLE, logId: NEW_LOG },
    { page: 'drive', dongleId: DONGLE, logId: DEMO_LOG },
    { page: 'drive', dongleId: DONGLE, logId: OLD_LOG },
    { page: 'drive', dongleId: DONGLE, logId: NEW_LOG, zoom: { start: 556000, end: 610000 } },
    { page: 'drive', dongleId: DONGLE, logId: NEW_LOG, zoom: { start: 0, end: 30000 } },
  ])('round trips $page $logId $zoom', (view) => {
    expect(parseUrl(urlFor(view))).toEqual(view);
  });

  it('rounds a zoom outward to whole seconds', () => {
    const view = { page: 'drive', dongleId: DONGLE, logId: NEW_LOG, zoom: { start: 1500, end: 2100 } };
    expect(urlFor(view)).toBe(`/${DONGLE}/${NEW_LOG}/1/3`);
  });
});
