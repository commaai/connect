import { parseLocation, buildLocation } from './url';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

it.each([
  ['/', { page: 'dashboard', dongleId: null }],
  ['/demo', { page: 'demo', dongleId: null }],
  ['/referrals', { page: 'referrals', dongleId: null }],
  ['/auth/', { page: 'auth', dongleId: null }],
  [`/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
  [`/${DONGLE}/prime`, { primeNav: true }],
  [`/${DONGLE}/stream`, { streamNav: true }],
  [`/${DONGLE}/${LOG}`, { selectedRouteId: LOG, zoom: null }],
  [`/${DONGLE}/${LOG}/0/20`, { selectedRouteId: LOG, zoom: { start: 0, end: 20000 } }],
  [`/${DONGLE}/1000/2000`, { selectedRouteId: null, legacyZoom: { start: 1000, end: 2000 } }],
])('parses %s', (pathname, expected) => {
  expect(parseLocation({ pathname })).toMatchObject(expected);
});

it.each([`/prefix${DONGLE}`, `/${DONGLE}/not-a-route`, `/${DONGLE}/${LOG}/NaN/20`, `/${DONGLE}/${LOG}/20/10`])('does not interpret malformed selection %s as a drive range', (pathname) => {
  expect(parseLocation({ pathname }).zoom).toBeNull();
});

it('parses settings over a drive without changing its selection', () => {
  expect(parseLocation({ pathname: `/${DONGLE}/${LOG}`, search: `?modal=settings&device=${OTHER}` }))
    .toMatchObject({ selectedRouteId: LOG, modal: 'settings', modalDeviceId: OTHER });
});

it.each(['add-device', 'filter', 'uploads', 'clip', 'files', 'info', 'clips', 'delete-clip', 'unpair', 'prime-cancel', 'prime-switch'])('parses the %s dialog', (modal) => {
  expect(parseLocation({ pathname: `/${DONGLE}`, search: `?modal=${modal}&clip=road.mp4` }))
    .toMatchObject({ modal, modalDeviceId: DONGLE, clipFilename: ['clip', 'delete-clip'].includes(modal) ? 'road.mp4' : null });
});

it('retains the settings context under an upload dialog', () => {
  const navigation = parseLocation({ pathname: `/${DONGLE}`, search: `?modal=uploads&parent=settings&device=${OTHER}` });
  expect(navigation).toMatchObject({ modal: 'uploads', parentModal: 'settings', modalDeviceId: OTHER });
  expect(buildLocation(navigation)).toEqual({ pathname: `/${DONGLE}`, search: `?modal=uploads&parent=settings&device=${OTHER}` });
});

it('ignores unknown dialog arguments', () => {
  expect(parseLocation({ pathname: `/${DONGLE}`, search: '?modal=unknown' }).modal).toBeNull();
});

it('builds a zero-start range in seconds', () => {
  expect(buildLocation({ dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 0, end: 20000 } }))
    .toEqual({ pathname: `/${DONGLE}/${LOG}/0/20`, search: '' });
});

it('closing a cold demo dialog retains the demo entry', () => {
  const navigation = parseLocation({ pathname: '/demo', search: '?modal=filter' });
  expect(buildLocation({ ...navigation, modal: null })).toEqual({ pathname: '/demo', search: '' });
});

it('a dialog retains its legacy timestamp range until conversion succeeds', () => {
  const navigation = parseLocation({ pathname: `/${DONGLE}/1000/2000` });
  expect(buildLocation({ ...navigation, modal: 'filter' }))
    .toEqual({ pathname: `/${DONGLE}/1000/2000`, search: '?modal=filter' });
});

it('opens and closes a dialog while retaining unrelated query arguments', () => {
  const navigation = { dongleId: DONGLE, selectedRouteId: LOG, modal: 'settings', modalDeviceId: OTHER };
  expect(buildLocation(navigation, '?ci=1'))
    .toEqual({ pathname: `/${DONGLE}/${LOG}`, search: `?ci=1&modal=settings&device=${OTHER}` });
  expect(buildLocation({ ...navigation, modal: null }, `?ci=1&modal=settings&device=${OTHER}`))
    .toEqual({ pathname: `/${DONGLE}/${LOG}`, search: '?ci=1' });
});
