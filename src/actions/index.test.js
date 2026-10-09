import { push } from 'connected-react-router';

import { navigate, showSettings, zoomDrive } from './index';

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// run a thunk the way redux-thunk would and collect the plain actions it ends in
function run(action, url) {
  const [pathname, search] = url.split('?');
  const state = {
    dongleId: DONGLE,
    currentRoute: { log_id: LOG, duration: 60000 },
    router: { location: { pathname, search: search ? `?${search}` : '' } },
  };
  const dispatched = [];
  const dispatch = (next) => (typeof next === 'function' ? next(dispatch, () => state) : dispatched.push(next));
  dispatch(action);
  return dispatched;
}

describe('navigation', () => {
  it.each([
    ['another page of the current device', { page: 'prime' }, `/${DONGLE}/prime`],
    ['a drive of the current device', { page: 'drive', logId: LOG }, `/${DONGLE}/${LOG}`],
    ['another device', { page: 'dashboard', dongleId: OTHER }, `/${OTHER}`],
    ['a page without a device', { page: 'referrals' }, '/referrals'],
  ])('goes to %s', (_name, destination, url) => {
    expect(run(navigate(destination), `/${DONGLE}`)).toEqual([push(url)]);
  });

  it('stays put when already there', () => {
    expect(run(navigate({ page: 'prime' }), `/${DONGLE}/prime`)).toEqual([]);
  });

  it('zooms the open drive, and back out to the whole of it', () => {
    expect(run(zoomDrive(10000, 20000), `/${DONGLE}/${LOG}`)).toEqual([push(`/${DONGLE}/${LOG}/10/20`)]);
    expect(run(zoomDrive(0, 20000), `/${DONGLE}/${LOG}`)).toEqual([push(`/${DONGLE}/${LOG}/0/20`)]);
    expect(run(zoomDrive(0, 60000), `/${DONGLE}/${LOG}/10/20`)).toEqual([push(`/${DONGLE}/${LOG}`)]);
  });

  it('opens and closes settings without leaving the page', () => {
    const zoomed = `/${DONGLE}/${LOG}/10/20`;
    expect(run(showSettings(OTHER), zoomed)).toEqual([push(`${zoomed}?settings=${OTHER}`)]);
    expect(run(showSettings(null), `${zoomed}?settings=${OTHER}`)).toEqual([push(zoomed)]);
  });
});
